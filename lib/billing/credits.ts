// Personalisations bought in advance (issue #96, docs/features/billing.md).
//
// * POST /api/credits/checkout opens a Stripe-hosted Checkout in payment mode
//   for 1 to 5 x the wrapper's Price (STRIPE_PRICE_WRAPPER), not tied to a
//   gift. Its metadata ({kind: "credits", owner, quantity}) is written here,
//   on the server, from the signed-in user and the checked quantity.
// * The webhook (checkout.session.completed / async_payment_succeeded, paid)
//   and the return page (/dashboard/purchases?topup=<session>) both call
//   applyPaidCreditsSession. It reads the session from Stripe, takes the
//   quantity from the session's own line item (checked against the metadata
//   and the amount), and grant_design_credits() records it once per session
//   (0013_design_credits.sql).
// * POST /api/credits/use calls claimDesignCredit: claim_design_credit() uses
//   one and records the purchase as paid with amount 0, then the purchase
//   goes to the design queue exactly as a paid one. A failed run gives it
//   back (returnDesignCredit, from ./refunds.ts) and never reaches Stripe.
import "server-only"
import type Stripe from "stripe"
import { CREDIT_CONSENT_TEXT, topUp, wrapper } from "@/lib/plans"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getMyLetterForWrapper } from "./my-purchases"
import { getPurchase, returnDesignCredit, type Purchase } from "./purchases"
import { enqueueDesign } from "./queue"
import { cleanWrapperRequest, type BillingUser } from "./service"
import { CREDITS_INTEGRATION_ID, createStripeClient, wrapperPriceId } from "./stripe"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,250}$/

export const CREDITS_KIND = "credits"

// ---------- Buying ----------

export type TopUpRefusal = "invalid_quantity" | "account_required"

export type TopUpStart = { kind: "redirect"; url: string } | { kind: "refused"; reason: TopUpRefusal; message: string }

const TOP_UP_REFUSALS: Record<TopUpRefusal, string> = {
  invalid_quantity: `Choose between 1 and ${topUp.maxQuantity} personalisations.`,
  account_required: "Create a free account first, so your receipt and your personalisations have a home.",
}

export function parseQuantity(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= topUp.maxQuantity ? value : null
}

// Checkout Sessions last this long; an abandoned one cannot be paid later.
const SESSION_LIFETIME_SECONDS = 60 * 60

export async function startCreditsCheckout(user: BillingUser, input: { quantity: unknown }, siteUrl: string): Promise<TopUpStart> {
  const quantity = parseQuantity(input.quantity)
  if (quantity === null) return { kind: "refused", reason: "invalid_quantity", message: TOP_UP_REFUSALS.invalid_quantity }
  // A guest account lives in one browser and has no email for the receipt.
  if (user.isAnonymous) return { kind: "refused", reason: "account_required", message: TOP_UP_REFUSALS.account_required }

  // Written here from the session's user, never from the browser.
  const metadata = { kind: CREDITS_KIND, owner: user.id, quantity: String(quantity) }
  const session = await createStripeClient().checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: wrapperPriceId(), quantity }],
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    metadata,
    payment_intent_data: { metadata, description: `${topUp.productName} x ${quantity}` },
    // No payment_method_types: Stripe shows the methods enabled in the Dashboard.
    success_url: `${siteUrl}/dashboard/purchases?topup={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/dashboard/purchases`,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
    // As for the wrapper (./service.ts): Majnu is the seller.
    managed_payments: { enabled: false },
    integration_identifier: CREDITS_INTEGRATION_ID,
  })
  if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL")
  return { kind: "redirect", url: session.url }
}

// ---------- Granting (webhook and return page) ----------

export function isCreditsSession(session: Pick<Stripe.Checkout.Session, "metadata" | "mode">): boolean {
  return session.mode === "payment" && session.metadata?.kind === CREDITS_KIND
}

function isPaid(session: Stripe.Checkout.Session): boolean {
  return session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required")
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

// Retrieve with these, so the quantity comes from the line item Stripe charged
// and the receipt from the charge.
export const CREDITS_SESSION_EXPAND = ["line_items", "payment_intent.latest_charge"]

export type GrantResult = { outcome: "granted" | "already_granted"; quantity: number; balance: number } | { outcome: "ignored"; reason: string }

// The quantity the session paid for, from its own line item: our Price, the
// same number as the metadata we wrote, and an amount that matches. Null when
// anything disagrees, and then nothing is granted.
export function paidQuantity(session: Stripe.Checkout.Session, priceId: string): number | null {
  const fromMetadata = Number(session.metadata?.quantity)
  const items = session.line_items?.data ?? []
  if (items.length !== 1) return null
  const item = items[0]
  if (idOf(item.price) !== priceId || item.quantity !== fromMetadata) return null
  const quantity = parseQuantity(fromMetadata)
  if (quantity === null) return null
  if (session.currency !== wrapper.currency || session.amount_total === null || session.amount_total <= 0) return null
  return quantity
}

type GrantRow = { outcome: string; grant_id: string | null; balance: number | null }

export async function applyPaidCreditsSession(session: Stripe.Checkout.Session): Promise<GrantResult> {
  if (!isCreditsSession(session)) return { outcome: "ignored", reason: "not a top-up" }
  if (!isPaid(session)) return { outcome: "ignored", reason: "not paid" }
  const owner = session.metadata?.owner ?? ""
  if (!UUID.test(owner) || session.client_reference_id !== owner) return { outcome: "ignored", reason: "owner does not match" }
  const quantity = paidQuantity(session, wrapperPriceId())
  if (quantity === null) {
    console.error("credits: session does not match its line item", session.id)
    return { outcome: "ignored", reason: "quantity does not match" }
  }

  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null
  const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null
  const { data, error } = await createAdminClient()
    .rpc("grant_design_credits", {
      p_owner_id: owner,
      p_quantity: quantity,
      p_checkout_session_id: session.id,
      p_payment_intent_id: idOf(session.payment_intent),
      p_amount_cents: session.amount_total,
      p_currency: session.currency,
      p_receipt_url: charge?.receipt_url ?? null,
    })
    .single<GrantRow>()
  if (error) throw new Error(`Could not grant the personalisations: ${error.message}`)
  const outcome = data.outcome === "granted" ? "granted" : "already_granted"
  return { outcome, quantity, balance: Math.max(0, data.balance ?? 0) }
}

export type TopUpReturn = { outcome: "granted"; quantity: number } | { outcome: "processing" } | { outcome: "not_found" }

// The return page: only the session id comes from the URL, and only as a key
// to look the session up in Stripe. It must be a top-up of this user.
export async function confirmTopUp(user: Pick<BillingUser, "id">, sessionId: string | null): Promise<TopUpReturn> {
  if (!sessionId || !SESSION_ID.test(sessionId)) return { outcome: "not_found" }
  let session: Stripe.Checkout.Session
  try {
    session = await createStripeClient().checkout.sessions.retrieve(sessionId, { expand: CREDITS_SESSION_EXPAND })
  } catch (error) {
    if (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "resource_missing") return { outcome: "not_found" }
    throw error
  }
  if (!isCreditsSession(session) || session.client_reference_id !== user.id || session.metadata?.owner !== user.id) return { outcome: "not_found" }
  if (!isPaid(session)) return session.status === "complete" ? { outcome: "processing" } : { outcome: "not_found" }
  const result = await applyPaidCreditsSession(session)
  return result.outcome === "ignored" ? { outcome: "not_found" } : { outcome: "granted", quantity: result.quantity }
}

// ---------- Reading ----------

export async function designCreditsBalance(ownerId: string): Promise<number> {
  const { data, error } = await createAdminClient().rpc("design_credits_balance", { p_owner_id: ownerId })
  if (error) throw new Error(`Could not count your personalisations: ${error.message}`)
  return typeof data === "number" ? Math.max(0, data) : 0
}

export type CreditGrant = {
  id: string
  quantity: number
  refundedQuantity: number
  amountCents: number
  currency: string
  receiptUrl: string | null
  createdAt: string
}

type GrantListRow = {
  id: string
  quantity: number
  refunded_quantity: number
  amount_cents: number
  currency: string
  receipt_url: string | null
  created_at: string
}

// The owner's top-ups, newest first, through row-level security and the
// column grant (the Stripe ids are not granted).
export async function listMyCreditGrants(): Promise<CreditGrant[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("credit_grants")
    .select("id, quantity, refunded_quantity, amount_cents, currency, receipt_url, created_at")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<GrantListRow[]>()
  if (error) throw new Error(`Could not load your top-ups: ${error.message}`)
  return (data ?? []).map((row) => ({
    id: row.id,
    quantity: row.quantity,
    refundedQuantity: row.refunded_quantity,
    amountCents: row.amount_cents,
    currency: row.currency,
    receiptUrl: row.receipt_url,
    createdAt: row.created_at,
  }))
}

// ---------- Using one ----------

export type CreditUseInput = { letterId: unknown; request: unknown; consent: unknown }

export type CreditUseRefusal =
  | "invalid_request"
  | "consent_required"
  | "letter_not_found"
  | "not_a_letter"
  | "not_built"
  | "in_progress"
  | "none_left"

export type CreditUse =
  | { kind: "claimed"; purchase: Purchase; letter: { slug: string; title: string | null }; balance: number }
  | { kind: "refused"; reason: CreditUseRefusal; message: string; balance: number | null }

const USE_REFUSALS: Record<CreditUseRefusal, string> = {
  invalid_request: "Describe the look you want in a few words.",
  consent_required: "Tick the box to agree that we start your design straight away.",
  letter_not_found: "We couldn't find that gift.",
  not_a_letter: "Personalised wrappers are for letters and gifts. A calendar keeps its own design.",
  not_built: "Wrap the gift first, then make it unique.",
  in_progress: "A design for this gift is already being made. It shows on the gift page as soon as it is ready.",
  none_left: `You have no personalisations left. Buy more on the Purchases tab, or pay ${wrapper.price} for this one.`,
}

function refusedUse(reason: CreditUseRefusal, balance: number | null = null): CreditUse {
  return { kind: "refused", reason, message: USE_REFUSALS[reason], balance }
}

type ClaimRow = { outcome: string; purchase_id: string | null; balance: number | null }

export async function claimDesignCredit(user: Pick<BillingUser, "id">, input: CreditUseInput): Promise<CreditUse> {
  // As for Checkout: the consent first, and the server keeps its own copy of the sentence.
  if (input.consent !== true) return refusedUse("consent_required")
  const request = cleanWrapperRequest(input.request)
  if (!request) return refusedUse("invalid_request")
  if (typeof input.letterId !== "string" || !UUID.test(input.letterId)) return refusedUse("letter_not_found")

  const letter = await getMyLetterForWrapper(input.letterId)
  if (!letter) return refusedUse("letter_not_found")
  if (letter.kind !== "letter") return refusedUse("not_a_letter")
  if (!letter.built) return refusedUse("not_built")

  const { data, error } = await createAdminClient()
    .rpc("claim_design_credit", {
      p_owner_id: user.id,
      p_letter_id: letter.id,
      p_request: request,
      p_consent_text: CREDIT_CONSENT_TEXT,
    })
    .single<ClaimRow>()
  if (error) throw new Error(`Could not use a personalisation: ${error.message}`)
  if (data.outcome === "none_left") return refusedUse("none_left", 0)
  if (data.outcome === "in_progress") return refusedUse("in_progress")
  if (data.outcome !== "claimed" || !data.purchase_id) return refusedUse("letter_not_found")

  const purchaseId = data.purchase_id
  let purchase: Purchase | null
  try {
    purchase = await getPurchase(purchaseId)
    if (!purchase) throw new Error("The purchase could not be read back")
    await enqueueDesign(purchaseId)
  } catch (error) {
    // The design cannot start: give the personalisation back rather than
    // spend it on a purchase that would wait for ever and block the letter.
    await returnDesignCredit(purchaseId, `Could not start the design: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
  return { kind: "claimed", purchase, letter: { slug: letter.slug, title: null }, balance: Math.max(0, data.balance ?? 0) }
}
