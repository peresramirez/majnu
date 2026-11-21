// The personalised wrapper: €2.99 once for a design made for one gift
// (docs/business-plan.md). Opening Checkout, confirming it on return, and
// acting on Stripe's events.
//
// How a purchase stays correct (docs/features/billing.md):
// * POST /api/checkout records a pending purchase with the sender's request
//   and consent, then opens a Stripe Checkout Session in payment mode that
//   carries the purchase id. Nothing is charged before the consent is on file.
// * The webhook (checkout.session.completed and, for delayed payment methods,
//   checkout.session.async_payment_succeeded) is the source of truth; the
//   return page applies the same step so the sender sees progress at once.
//   Both retrieve the session from Stripe and move the purchase from pending
//   to paid with a conditional update, so replays and races change nothing.
// * Every caller that finds the purchase paid hands it to the design queue.
//   Duplicates are harmless: the job claims it once (lib/billing/fulfil.ts).
import "server-only"
import type Stripe from "stripe"
import { WRAPPER_CONSENT_TEXT, WRAPPER_REQUEST_MAX_CHARS, wrapper } from "@/lib/plans"
import { safeNextPath } from "./next-path"
import {
  attachCheckoutSession,
  deletePendingPurchase,
  getActivePurchaseForLetter,
  getMyLetterForWrapper,
  getPendingPurchasesForLetter,
  getPurchase,
  insertPendingPurchase,
  markPaid,
  type Purchase,
  type PurchaseStatus,
} from "./purchases"
import { enqueueDesign } from "./queue"
import { refundPurchase } from "./refunds"
import { CHECKOUT_INTEGRATION_ID, createStripeClient, wrapperPriceId } from "./stripe"

export type BillingUser = { id: string; email?: string | null; isAnonymous: boolean }

// ---------- Opening Checkout ----------

export type CheckoutInput = { letterId: unknown; request: unknown; consent: unknown; returnTo?: unknown }

export type CheckoutRefusal =
  | "invalid_request"
  | "consent_required"
  | "account_required"
  | "letter_not_found"
  | "not_a_letter"
  | "not_built"
  | "in_progress"

export type CheckoutStart =
  | { kind: "redirect"; url: string; purchaseId: string }
  | { kind: "refused"; reason: CheckoutRefusal; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const REFUSALS: Record<CheckoutRefusal, string> = {
  invalid_request: `Describe the look you want in a few words (at most ${WRAPPER_REQUEST_MAX_CHARS} characters).`,
  consent_required: "Tick the box to agree that we start your design straight away.",
  account_required: "Create a free account first, so your receipt and your design have a home. Your gifts come with you.",
  letter_not_found: "We couldn't find that gift.",
  not_a_letter: "Personalised wrappers are for letters and gifts. A calendar keeps its own design.",
  not_built: "Wrap the gift first, then make it unique.",
  in_progress: "A design for this gift is already being made. It shows on the gift page as soon as it is ready.",
}

function refused(reason: CheckoutRefusal): CheckoutStart {
  return { kind: "refused", reason, message: REFUSALS[reason] }
}

// The sender's request as we store it: one paragraph of plain text.
export function cleanWrapperRequest(value: unknown): string | null {
  if (typeof value !== "string") return null
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (text.length < 3 || text.length > WRAPPER_REQUEST_MAX_CHARS) return null
  return text
}

// Checkout Sessions last this long; an abandoned one cannot be paid later.
const SESSION_LIFETIME_SECONDS = 60 * 60

export async function startWrapperCheckout(user: BillingUser, input: CheckoutInput, siteUrl: string): Promise<CheckoutStart> {
  // The consent is checked before anything else is read or written: no
  // Checkout without it, and the server never trusts a consent text it was sent.
  if (input.consent !== true) return refused("consent_required")
  const request = cleanWrapperRequest(input.request)
  if (!request) return refused("invalid_request")
  if (typeof input.letterId !== "string" || !UUID.test(input.letterId)) return refused("letter_not_found")
  // A guest account lives in one browser and has no email for the receipt.
  if (user.isAnonymous) return refused("account_required")

  const letter = await getMyLetterForWrapper(input.letterId)
  if (!letter) return refused("letter_not_found")
  // A calendar baked into one static page would carry its locked doors.
  if (letter.kind !== "letter") return refused("not_a_letter")
  if (!letter.built) return refused("not_built")

  const stripe = createStripeClient()
  if (await hasRunInProgress(stripe, letter.id, user.id)) return refused("in_progress")

  const purchase = await insertPendingPurchase({
    ownerId: user.id,
    letterId: letter.id,
    request,
    consentAt: new Date().toISOString(),
    consentText: WRAPPER_CONSENT_TEXT,
    amountCents: wrapper.priceCents,
    currency: wrapper.currency,
  })

  const back = (typeof input.returnTo === "string" && safeNextPath(input.returnTo)) || "/dashboard/purchases"
  const metadata = { purchase_id: purchase.id, letter_id: letter.id, user_id: user.id }
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        line_items: [{ price: wrapperPriceId(), quantity: 1 }],
        client_reference_id: user.id,
        customer_email: user.email ?? undefined,
        metadata,
        payment_intent_data: { metadata, description: wrapper.productName },
        // No payment_method_types: Stripe shows the methods enabled in the Dashboard.
        success_url: `${siteUrl}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}${back}`,
        expires_at: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
        // Majnu is the seller and states prices including VAT (docs/business-
        // plan.md). The Stripe account has Managed Payments (Stripe as merchant
        // of record) on by default; it is switched off per session until the
        // developer decides otherwise, since it changes who sells, the fees,
        // the terms and how VAT is handled.
        managed_payments: { enabled: false },
        integration_identifier: CHECKOUT_INTEGRATION_ID,
      },
      // A double click gets the same session, not a second one.
      { idempotencyKey: `majnu-wrapper-checkout-${purchase.id}` },
    )
    if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL")
    await attachCheckoutSession(purchase.id, session.id)
  } catch (error) {
    await deletePendingPurchase(purchase.id).catch(() => undefined)
    throw error
  }
  return { kind: "redirect", url: session.url, purchaseId: purchase.id }
}

// True when the letter already has a paid design on its way. Earlier unpaid
// Checkouts for the letter are expired first, so one gift is not paid for
// twice from two tabs; one that turns out to be paid already is applied.
async function hasRunInProgress(stripe: Stripe, letterId: string, ownerId: string): Promise<boolean> {
  if (await getActivePurchaseForLetter(letterId)) return true
  for (const pending of await getPendingPurchasesForLetter(letterId, ownerId)) {
    if (!pending.checkoutSessionId) {
      await deletePendingPurchase(pending.id)
      continue
    }
    const session = await stripe.checkout.sessions.retrieve(pending.checkoutSessionId, { expand: ["payment_intent.latest_charge"] })
    if (session.status === "open") {
      await stripe.checkout.sessions.expire(session.id)
      await deletePendingPurchase(pending.id)
    } else if (session.status === "expired") {
      await deletePendingPurchase(pending.id)
    } else if (isPaid(session)) {
      // Paid, but the webhook has not arrived yet.
      const status = await applyPaidSession(session)
      if (status === "paid" || status === "designing") return true
    }
  }
  return false
}

// ---------- Paid sessions (return page and webhook) ----------

function isPaid(session: Stripe.Checkout.Session): boolean {
  return session.mode === "payment" && session.status === "complete" && (session.payment_status === "paid" || session.payment_status === "no_payment_required")
}

function idOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

// Moves the session's purchase to paid (once) and hands it to the design
// queue. Expects the session retrieved from Stripe with
// payment_intent.latest_charge expanded (for the receipt). Returns the
// purchase's status afterwards, or null when the session is not one of ours.
export async function applyPaidSession(session: Stripe.Checkout.Session): Promise<PurchaseStatus | null> {
  const purchaseId = session.metadata?.purchase_id
  if (!purchaseId || !UUID.test(purchaseId) || !isPaid(session)) return null

  const intent = typeof session.payment_intent === "object" ? session.payment_intent : null
  const charge = intent && typeof intent.latest_charge === "object" ? intent.latest_charge : null
  const result = await markPaid(purchaseId, {
    checkoutSessionId: session.id,
    paymentIntentId: idOf(session.payment_intent),
    receiptUrl: charge?.receipt_url ?? null,
    amountCents: session.amount_total ?? null,
    currency: session.currency ?? null,
  })

  if (result.outcome === "conflict") {
    // A second payment for a letter whose design is already being made (two
    // Checkout tabs paid at once). Give it back rather than run it twice.
    if (result.purchase?.status === "pending") {
      await refundPurchase(
        { id: purchaseId, paymentIntentId: idOf(session.payment_intent) },
        "Paid twice: a design for this gift was already being made",
      )
    }
    return (await getPurchase(purchaseId))?.status ?? null
  }

  const purchase = result.purchase
  if (!purchase) return null
  // Hand it over whenever it is (still) paid: after this transition, or when
  // an earlier caller marked it paid but could not reach the queue.
  if (purchase.status === "paid") await enqueueDesign(purchase.id)
  return purchase.status
}

export type ReturnOutcome =
  | { outcome: "paid" | "processing"; purchaseId: string }
  | { outcome: "not_found" }

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,250}$/

// The return page: only the session id comes from the URL, and only as a key
// to look the session up in Stripe. It must have been created for this user,
// for one of their purchases.
export async function confirmCheckout(user: Pick<BillingUser, "id">, sessionId: string | null): Promise<ReturnOutcome> {
  if (!sessionId || !SESSION_ID.test(sessionId)) return { outcome: "not_found" }

  let session: Stripe.Checkout.Session
  try {
    session = await createStripeClient().checkout.sessions.retrieve(sessionId, { expand: ["payment_intent.latest_charge"] })
  } catch (error) {
    if (isMissingResource(error)) return { outcome: "not_found" }
    throw error
  }

  const purchaseId = session.metadata?.purchase_id
  if (session.client_reference_id !== user.id || session.mode !== "payment" || !purchaseId) return { outcome: "not_found" }
  const purchase = await getPurchase(purchaseId)
  if (!purchase || purchase.ownerId !== user.id || purchase.checkoutSessionId !== session.id) return { outcome: "not_found" }

  if (purchase.status !== "pending") return { outcome: "paid", purchaseId }
  // Complete but unpaid: a delayed payment method. The webhook finishes it.
  if (!isPaid(session)) return session.status === "complete" ? { outcome: "processing", purchaseId } : { outcome: "not_found" }
  await applyPaidSession(session)
  return { outcome: "paid", purchaseId }
}

function isMissingResource(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "resource_missing"
}

// ---------- Webhook ----------

export type EventOutcome = { outcome: "applied"; status: PurchaseStatus | null } | { outcome: "ignored"; reason: string }

// The events the webhook endpoint subscribes to in the Stripe Dashboard.
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "checkout.session.expired",
] as const

export async function handleStripeEvent(event: Stripe.Event): Promise<EventOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const snapshot = event.data.object
      if (snapshot.mode !== "payment" || !snapshot.metadata?.purchase_id) return ignored("not a wrapper checkout")
      // Fulfil only what is paid; a delayed method completes first and pays later.
      if (snapshot.payment_status === "unpaid") return ignored("waiting for a delayed payment")
      // The snapshot may be old; read the session as it is now, with the charge for the receipt.
      const session = await createStripeClient().checkout.sessions.retrieve(snapshot.id, { expand: ["payment_intent.latest_charge"] })
      const status = await applyPaidSession(session)
      return status ? { outcome: "applied", status } : ignored("no matching purchase")
    }
    case "checkout.session.async_payment_failed":
    case "checkout.session.expired": {
      // Never paid: the pending row was not a purchase.
      const purchaseId = event.data.object.metadata?.purchase_id
      if (!purchaseId || !UUID.test(purchaseId)) return ignored("not a wrapper checkout")
      await deletePendingPurchase(purchaseId)
      return { outcome: "applied", status: null }
    }
    default:
      return ignored(`unhandled event type ${event.type}`)
  }
}

function ignored(reason: string): EventOutcome {
  return { outcome: "ignored", reason }
}

export type { Purchase }
