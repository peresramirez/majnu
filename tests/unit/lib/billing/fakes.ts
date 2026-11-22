// In-memory stand-ins for lib/billing/purchases.ts and Stripe, shared by the
// billing tests. The purchases fake applies the same rules as the database:
// each status change is conditional on the status before it, a session can
// only pay for its own purchase, and at most one purchase per letter may be
// paid or designing (purchases_one_run_per_letter_idx).
import { vi } from "vitest"
import type { WrapperLetter } from "@/lib/billing/my-purchases"
import type { MarkPaidResult, NewPurchase, Payment, Purchase, PurchaseStatus } from "@/lib/billing/purchases"

export type StoredPurchase = Purchase & { consentText: string | null; failureReason: string | null }

export type StoredCoupon = { id: string; uses: number; maxUses: number }

export const db = {
  purchases: new Map<string, StoredPurchase>(),
  letters: new Map<string, WrapperLetter & { ownerId: string }>(),
  coupons: new Map<string, StoredCoupon>(),
  // Whose session the user client reads with (row-level security).
  currentUser: "user-1",
  seq: 0,
}

export function resetDb() {
  db.purchases.clear()
  db.letters.clear()
  db.coupons.clear()
  db.currentUser = "user-1"
  db.seq = 0
}

export function addLetter(id: string, overrides: Partial<WrapperLetter & { ownerId: string }> = {}) {
  db.letters.set(id, { id, slug: `slug-${id.slice(0, 6)}`, kind: "letter", built: true, ownerId: "user-1", ...overrides })
}

export function addPurchase(overrides: Partial<StoredPurchase> & { letterId: string }): StoredPurchase {
  db.seq++
  const id = overrides.id ?? `00000000-0000-4000-8000-${String(db.seq).padStart(12, "0")}`
  const purchase: StoredPurchase = {
    id,
    ownerId: "user-1",
    status: "pending",
    request: "A night sky",
    consentAt: "2026-11-21T20:00:00.000Z",
    couponId: null,
    consentText: "consent",
    amountCents: 299,
    currency: "eur",
    checkoutSessionId: null,
    paymentIntentId: null,
    refundId: null,
    receiptUrl: null,
    designId: null,
    paidAt: null,
    designStartedAt: null,
    finishedAt: null,
    refundedAt: null,
    createdAt: "2026-11-21T20:00:00.000Z",
    failureReason: null,
    ...overrides,
  }
  db.purchases.set(id, purchase)
  return purchase
}

function strip(p: StoredPurchase | undefined): Purchase | null {
  if (!p) return null
  const { consentText: _c, failureReason: _f, ...rest } = p
  return { ...rest }
}

function transition(id: string, from: PurchaseStatus[], change: Partial<StoredPurchase>): StoredPurchase | null {
  const p = db.purchases.get(id)
  if (!p || !from.includes(p.status)) return null
  Object.assign(p, change)
  return p
}

const now = () => new Date().toISOString()

export const purchasesModule = {
  insertPendingPurchase: vi.fn(async (input: NewPurchase) => {
    const p = addPurchase({ ...input, status: "pending" })
    return strip(p)!
  }),
  attachCheckoutSession: vi.fn(async (id: string, sessionId: string) => {
    transition(id, ["pending"], { checkoutSessionId: sessionId })
  }),
  deletePendingPurchase: vi.fn(async (id: string) => {
    if (db.purchases.get(id)?.status === "pending") db.purchases.delete(id)
  }),
  getPurchase: vi.fn(async (id: string) => strip(db.purchases.get(id))),
  getActivePurchaseForLetter: vi.fn(async (letterId: string) =>
    strip([...db.purchases.values()].find((p) => p.letterId === letterId && (p.status === "paid" || p.status === "designing"))),
  ),
  getPendingPurchasesForLetter: vi.fn(async (letterId: string, ownerId: string) =>
    [...db.purchases.values()].filter((p) => p.letterId === letterId && p.ownerId === ownerId && p.status === "pending").map((p) => strip(p)!),
  ),
  markPaid: vi.fn(async (id: string, payment: Payment): Promise<MarkPaidResult> => {
    const p = db.purchases.get(id)
    if (!p || p.status !== "pending" || p.checkoutSessionId !== payment.checkoutSessionId) return { outcome: "unchanged", purchase: strip(p) }
    const clash = [...db.purchases.values()].some((o) => o.id !== id && o.letterId === p.letterId && (o.status === "paid" || o.status === "designing"))
    if (clash) return { outcome: "conflict", purchase: strip(p) }
    Object.assign(p, {
      status: "paid",
      paidAt: now(),
      paymentIntentId: payment.paymentIntentId,
      receiptUrl: payment.receiptUrl,
      ...(payment.amountCents !== null ? { amountCents: payment.amountCents } : {}),
      ...(payment.currency ? { currency: payment.currency } : {}),
    })
    return { outcome: "paid", purchase: strip(p)! }
  }),
  claimForDesign: vi.fn(async (id: string) => strip(transition(id, ["paid"], { status: "designing", designStartedAt: now() }) ?? undefined)),
  markDone: vi.fn(async (id: string, designId: string) => {
    transition(id, ["designing"], { status: "done", designId, finishedAt: now(), failureReason: null })
  }),
  markRefunded: vi.fn(async (id: string, refundId: string, reason: string) => {
    transition(id, ["pending", "paid", "designing", "failed"], { status: "refunded", refundId, refundedAt: now(), finishedAt: now(), failureReason: reason })
  }),
  markFailed: vi.fn(async (id: string, reason: string) => {
    transition(id, ["pending", "paid", "designing"], { status: "failed", finishedAt: now(), failureReason: reason })
  }),
  // return_coupon_use in 0011_coupons.sql: only a coupon purchase that is
  // paid or designing, once, and the coupon gets one use back.
  returnCouponUse: vi.fn(async (id: string, reason: string) => {
    const p = db.purchases.get(id)
    if (!p?.couponId) return false
    if (!transition(id, ["paid", "designing"], { status: "failed", finishedAt: now(), failureReason: reason })) return false
    const coupon = db.coupons.get(p.couponId)
    if (coupon && coupon.uses > 0) coupon.uses--
    return true
  }),
}

// The owner's reads (lib/billing/my-purchases.ts), through "row-level security".
export const myPurchasesModule = {
  getMyLetterForWrapper: vi.fn(async (letterId: string) => {
    const l = db.letters.get(letterId)
    if (!l || l.ownerId !== db.currentUser) return null
    const { ownerId: _o, ...letter } = l
    return letter
  }),
}

// The parts of the Stripe client the billing code calls.
export const stripe = {
  checkout: { sessions: { create: vi.fn(), retrieve: vi.fn(), expire: vi.fn() } },
  refunds: { create: vi.fn() },
}

export const stripeModule = {
  createStripeClient: () => stripe,
  wrapperPriceId: () => {
    const id = process.env.STRIPE_PRICE_WRAPPER
    if (!id) throw new Error("STRIPE_PRICE_WRAPPER is not set")
    return id
  },
  CHECKOUT_INTEGRATION_ID: "majnu_wrapper_test",
}

export function resetStripe() {
  for (const fn of [stripe.checkout.sessions.create, stripe.checkout.sessions.retrieve, stripe.checkout.sessions.expire, stripe.refunds.create]) fn.mockReset()
  let n = 0
  stripe.refunds.create.mockImplementation(async () => ({ id: `re_test_${++n}` }))
}

// A Checkout Session as Stripe returns it after payment, with the charge expanded.
export function paidSession(purchase: Pick<Purchase, "id" | "letterId" | "ownerId" | "checkoutSessionId">, overrides: Record<string, unknown> = {}) {
  return {
    id: purchase.checkoutSessionId,
    object: "checkout.session",
    mode: "payment",
    status: "complete",
    payment_status: "paid",
    client_reference_id: purchase.ownerId,
    amount_total: 299,
    currency: "eur",
    metadata: { purchase_id: purchase.id, letter_id: purchase.letterId, user_id: purchase.ownerId },
    payment_intent: { id: `pi_test_${purchase.id.slice(-4)}`, object: "payment_intent", latest_charge: { id: "ch_test_1", receipt_url: "https://pay.stripe.com/receipts/r1" } },
    ...overrides,
  }
}
