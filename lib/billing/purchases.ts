// Reads and writes of `purchases` (supabase/migrations/0007_purchases.sql).
//
// Every write uses the service-role client: the status, the Stripe ids, the
// amount and the design are written only by server code, never from a value
// the browser sent. Each change of status is a conditional update ("... where
// status = <the one before>"), so it happens once however often Stripe
// delivers an event or the queue delivers a message, and two runs can never
// claim the same purchase. The owner's own reads, through row-level security,
// are in ./my-purchases.ts, so the queue consumer never loads the cookie-based
// client.
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export type PurchaseStatus = "pending" | "paid" | "designing" | "done" | "failed" | "refunded"

export type Purchase = {
  id: string
  ownerId: string
  letterId: string | null
  status: PurchaseStatus
  request: string
  // Null for a purchase paid with a coupon: nothing was paid, so no
  // withdrawal consent was asked for.
  consentAt: string | null
  amountCents: number
  currency: string
  // The coupon that paid for it (supabase/migrations/0011_coupons.sql), or
  // null when Stripe did. A coupon purchase has amount 0 and no Stripe ids.
  couponId: string | null
  // The UTC day (YYYY-MM-DD) whose free design paid for it
  // (supabase/migrations/0012_free_designs.sql), or null. A free purchase has
  // amount 0 and no Stripe ids either.
  freeDay: string | null
  checkoutSessionId: string | null
  paymentIntentId: string | null
  refundId: string | null
  receiptUrl: string | null
  designId: string | null
  paidAt: string | null
  designStartedAt: string | null
  finishedAt: string | null
  refundedAt: string | null
  createdAt: string
}

export type Row = {
  id: string
  owner_id: string
  letter_id: string | null
  status: string
  request: string
  consent_at: string | null
  amount_cents: number
  currency: string
  coupon_id: string | null
  free_day: string | null
  stripe_checkout_session_id: string | null
  stripe_payment_intent_id: string | null
  stripe_refund_id: string | null
  receipt_url: string | null
  design_id: string | null
  paid_at: string | null
  design_started_at: string | null
  finished_at: string | null
  refunded_at: string | null
  created_at: string
}

// Every column owners may read (failure_reason and free_ip_hash are left out
// on purpose).
export const COLUMNS =
  "id, owner_id, letter_id, status, request, consent_at, amount_cents, currency, coupon_id, free_day, stripe_checkout_session_id, stripe_payment_intent_id, stripe_refund_id, receipt_url, design_id, paid_at, design_started_at, finished_at, refunded_at, created_at"

const STATUSES: readonly PurchaseStatus[] = ["pending", "paid", "designing", "done", "failed", "refunded"]

export function toPurchase(row: Row): Purchase {
  return {
    id: row.id,
    ownerId: row.owner_id,
    letterId: row.letter_id,
    status: (STATUSES as readonly string[]).includes(row.status) ? (row.status as PurchaseStatus) : "failed",
    request: row.request,
    consentAt: row.consent_at,
    amountCents: row.amount_cents,
    currency: row.currency,
    couponId: row.coupon_id ?? null,
    freeDay: row.free_day ?? null,
    checkoutSessionId: row.stripe_checkout_session_id,
    paymentIntentId: row.stripe_payment_intent_id,
    refundId: row.stripe_refund_id,
    receiptUrl: row.receipt_url,
    designId: row.design_id,
    paidAt: row.paid_at,
    designStartedAt: row.design_started_at,
    finishedAt: row.finished_at,
    refundedAt: row.refunded_at,
    createdAt: row.created_at,
  }
}

const UNIQUE_VIOLATION = "23505"

// ---------- Server writes (service role) ----------

export type NewPurchase = {
  ownerId: string
  letterId: string
  request: string
  consentAt: string
  consentText: string
  amountCents: number
  currency: string
}

export async function insertPendingPurchase(input: NewPurchase): Promise<Purchase> {
  const { data, error } = await createAdminClient()
    .from("purchases")
    .insert({
      owner_id: input.ownerId,
      letter_id: input.letterId,
      request: input.request,
      consent_at: input.consentAt,
      consent_text: input.consentText,
      amount_cents: input.amountCents,
      currency: input.currency,
    })
    .select(COLUMNS)
    .single<Row>()
  if (error) throw new Error(`Could not record the purchase: ${error.message}`)
  return toPurchase(data)
}

export async function attachCheckoutSession(purchaseId: string, sessionId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("purchases")
    .update({ stripe_checkout_session_id: sessionId })
    .eq("id", purchaseId)
    .eq("status", "pending")
  if (error) throw new Error(`Could not save the Checkout Session: ${error.message}`)
}

// Removes a row that never became a purchase: Checkout could not be opened,
// or its session expired unpaid.
export async function deletePendingPurchase(purchaseId: string): Promise<void> {
  const { error } = await createAdminClient().from("purchases").delete().eq("id", purchaseId).eq("status", "pending")
  if (error) throw new Error(`Could not remove the unpaid purchase: ${error.message}`)
}

export async function getPurchase(purchaseId: string): Promise<Purchase | null> {
  const { data, error } = await createAdminClient().from("purchases").select(COLUMNS).eq("id", purchaseId).maybeSingle<Row>()
  if (error) throw new Error(`Could not load the purchase: ${error.message}`)
  return data ? toPurchase(data) : null
}

// A purchase of this letter that is paid and not finished: the one run the
// letter may have at a time (purchases_one_run_per_letter_idx).
export async function getActivePurchaseForLetter(letterId: string): Promise<Purchase | null> {
  const { data, error } = await createAdminClient()
    .from("purchases")
    .select(COLUMNS)
    .eq("letter_id", letterId)
    .in("status", ["paid", "designing"])
    .limit(1)
    .maybeSingle<Row>()
  if (error) throw new Error(`Could not check the letter's purchases: ${error.message}`)
  return data ? toPurchase(data) : null
}

// Unpaid Checkouts the owner opened for this letter earlier.
export async function getPendingPurchasesForLetter(letterId: string, ownerId: string): Promise<Purchase[]> {
  const { data, error } = await createAdminClient()
    .from("purchases")
    .select(COLUMNS)
    .eq("letter_id", letterId)
    .eq("owner_id", ownerId)
    .eq("status", "pending")
    .limit(10)
    .returns<Row[]>()
  if (error) throw new Error(`Could not check the letter's purchases: ${error.message}`)
  return (data ?? []).map(toPurchase)
}

export type Payment = { checkoutSessionId: string; paymentIntentId: string | null; receiptUrl: string | null; amountCents: number | null; currency: string | null }

export type MarkPaidResult =
  | { outcome: "paid"; purchase: Purchase }
  // It was already past pending: this delivery changes nothing.
  | { outcome: "unchanged"; purchase: Purchase | null }
  // Another purchase of the same letter is still paid or designing.
  | { outcome: "conflict"; purchase: Purchase | null }

// pending → paid, once. The session id must match the one Checkout was opened
// with, so a session can only ever pay for its own purchase.
export async function markPaid(purchaseId: string, payment: Payment): Promise<MarkPaidResult> {
  const update: Record<string, unknown> = {
    status: "paid",
    paid_at: new Date().toISOString(),
    stripe_payment_intent_id: payment.paymentIntentId,
    receipt_url: payment.receiptUrl,
  }
  if (payment.amountCents !== null) update.amount_cents = payment.amountCents
  if (payment.currency) update.currency = payment.currency
  const { data, error } = await createAdminClient()
    .from("purchases")
    .update(update)
    .eq("id", purchaseId)
    .eq("status", "pending")
    .eq("stripe_checkout_session_id", payment.checkoutSessionId)
    .select(COLUMNS)
    .maybeSingle<Row>()
  if (error?.code === UNIQUE_VIOLATION) return { outcome: "conflict", purchase: await getPurchase(purchaseId) }
  if (error) throw new Error(`Could not mark the purchase paid: ${error.message}`)
  if (data) return { outcome: "paid", purchase: toPurchase(data) }
  return { outcome: "unchanged", purchase: await getPurchase(purchaseId) }
}

// paid → designing, once: the design job's claim. Null when someone else
// claimed it first, or it is not paid.
export async function claimForDesign(purchaseId: string): Promise<Purchase | null> {
  const { data, error } = await createAdminClient()
    .from("purchases")
    .update({ status: "designing", design_started_at: new Date().toISOString() })
    .eq("id", purchaseId)
    .eq("status", "paid")
    .select(COLUMNS)
    .maybeSingle<Row>()
  if (error) throw new Error(`Could not claim the purchase: ${error.message}`)
  return data ? toPurchase(data) : null
}

// A free purchase keeps its address hash only while its design is on its way
// (0012_free_designs.sql); done and failed both clear it.
export async function markDone(purchaseId: string, designId: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("purchases")
    .update({ status: "done", design_id: designId, finished_at: new Date().toISOString(), failure_reason: null, free_ip_hash: null })
    .eq("id", purchaseId)
    .eq("status", "designing")
  if (error) throw new Error(`Could not mark the purchase done: ${error.message}`)
}

export async function markRefunded(purchaseId: string, refundId: string, reason: string): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await createAdminClient()
    .from("purchases")
    .update({ status: "refunded", stripe_refund_id: refundId, refunded_at: now, finished_at: now, failure_reason: reason.slice(0, 1000) })
    .eq("id", purchaseId)
    .in("status", ["pending", "paid", "designing", "failed"])
  if (error) throw new Error(`Could not mark the purchase refunded: ${error.message}`)
}

export async function markFailed(purchaseId: string, reason: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("purchases")
    .update({ status: "failed", finished_at: new Date().toISOString(), failure_reason: reason.slice(0, 1000), free_ip_hash: null })
    .eq("id", purchaseId)
    .in("status", ["pending", "paid", "designing"])
  if (error) throw new Error(`Could not mark the purchase failed: ${error.message}`)
}

// A coupon purchase whose design could not be made: marks it failed and gives
// its code one use back, once (return_coupon_use in 0011_coupons.sql), in one
// transaction. False when there was nothing to give back: not a coupon
// purchase, or no longer paid or designing (a second caller).
export async function returnCouponUse(purchaseId: string, reason: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("return_coupon_use", { p_purchase_id: purchaseId, p_reason: reason.slice(0, 1000) })
  if (error) throw new Error(`Could not give the code's use back: ${error.message}`)
  return data === true
}

// A free purchase whose design could not be made: marks it failed, clears its
// address hash and gives the day's free design back, once
// (return_free_design in 0012_free_designs.sql), in one transaction. False
// when there was nothing to give back: not a free purchase, or no longer paid
// or designing (a second caller).
export async function returnFreeDesign(purchaseId: string, reason: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("return_free_design", { p_purchase_id: purchaseId, p_reason: reason.slice(0, 1000) })
  if (error) throw new Error(`Could not give the free design back: ${error.message}`)
  return data === true
}
