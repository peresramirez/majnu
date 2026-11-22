// In-memory stand-ins for lib/billing/purchases.ts and Stripe, shared by the
// billing tests. The purchases fake applies the same rules as the database:
// each status change is conditional on the status before it, a session can
// only pay for its own purchase, and at most one purchase per letter may be
// paid or designing (purchases_one_run_per_letter_idx).
import { vi } from "vitest"
import type { WrapperLetter } from "@/lib/billing/my-purchases"
import type { MarkPaidResult, NewPurchase, Payment, Purchase, PurchaseStatus } from "@/lib/billing/purchases"

export type StoredPurchase = Purchase & { consentText: string | null; failureReason: string | null; freeIpHash: string | null }

export type StoredCoupon = { id: string; uses: number; maxUses: number }

// free_design_days (0012_free_designs.sql), keyed `${day}|${ipHash}`.
export type FreeCounter = { day: string; ipHash: string; used: number }

export type StoredGrant = { id: string; ownerId: string; quantity: number; refundedQuantity: number; amountCents: number; currency: string; sessionId: string; paymentIntentId: string | null; receiptUrl: string | null }

export const db = {
  purchases: new Map<string, StoredPurchase>(),
  letters: new Map<string, WrapperLetter & { ownerId: string }>(),
  coupons: new Map<string, StoredCoupon>(),
  freeDays: new Map<string, FreeCounter>(),
  // credit_grants (0013_design_credits.sql), keyed by Checkout Session id.
  creditGrants: new Map<string, StoredGrant>(),
  // Whose session the user client reads with (row-level security).
  currentUser: "user-1",
  seq: 0,
}

export function resetDb() {
  db.purchases.clear()
  db.letters.clear()
  db.coupons.clear()
  db.freeDays.clear()
  db.creditGrants.clear()
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
    freeDay: null,
    freeIpHash: null,
    paidWithCredit: false,
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
  const { consentText: _c, failureReason: _f, freeIpHash: _h, ...rest } = p
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
    transition(id, ["designing"], { status: "done", designId, finishedAt: now(), failureReason: null, freeIpHash: null })
  }),
  markRefunded: vi.fn(async (id: string, refundId: string, reason: string) => {
    transition(id, ["pending", "paid", "designing", "failed"], { status: "refunded", refundId, refundedAt: now(), finishedAt: now(), failureReason: reason })
  }),
  markFailed: vi.fn(async (id: string, reason: string) => {
    transition(id, ["pending", "paid", "designing"], { status: "failed", finishedAt: now(), failureReason: reason, freeIpHash: null })
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
  // return_design_credit in 0013_design_credits.sql: only a credit purchase
  // that is paid or designing, once. Failed, it no longer counts.
  returnDesignCredit: vi.fn(async (id: string, reason: string) => {
    const p = db.purchases.get(id)
    if (!p?.paidWithCredit) return false
    return transition(id, ["paid", "designing"], { status: "failed", finishedAt: now(), failureReason: reason }) !== null
  }),
  // return_free_design in 0012_free_designs.sql: only a free purchase that is
  // paid or designing, once; the hash is cleared and the day's use given back.
  returnFreeDesign: vi.fn(async (id: string, reason: string) => {
    const p = db.purchases.get(id)
    if (!p?.freeDay) return false
    const hash = p.freeIpHash
    if (!transition(id, ["paid", "designing"], { status: "failed", finishedAt: now(), failureReason: reason, freeIpHash: null })) return false
    const counter = hash ? db.freeDays.get(`${p.freeDay}|${hash}`) : undefined
    if (counter && counter.used > 0) counter.used--
    return true
  }),
}

// design_credits_balance (0013_design_credits.sql): bought minus refunded
// minus credit purchases that did not fail.
export function creditBalance(ownerId: string): number {
  const bought = [...db.creditGrants.values()].filter((g) => g.ownerId === ownerId).reduce((n, g) => n + g.quantity - g.refundedQuantity, 0)
  const used = [...db.purchases.values()].filter((p) => p.ownerId === ownerId && p.paidWithCredit && p.status !== "failed").length
  return bought - used
}

// grant_design_credits, claim_design_credit and design_credits_balance as the
// database answers them.
export function creditRpc(name: string, args: Record<string, unknown>): { data: unknown; error: null } {
  if (name === "design_credits_balance") return { data: creditBalance(args.p_owner_id as string), error: null }
  if (name === "grant_design_credits") {
    const sessionId = args.p_checkout_session_id as string
    const existing = db.creditGrants.get(sessionId)
    if (existing) return { data: { outcome: "already_granted", grant_id: existing.id, balance: creditBalance(existing.ownerId) }, error: null }
    db.seq++
    const grant: StoredGrant = {
      id: `00000000-0000-4000-9000-${String(db.seq).padStart(12, "0")}`,
      ownerId: args.p_owner_id as string,
      quantity: args.p_quantity as number,
      refundedQuantity: 0,
      amountCents: args.p_amount_cents as number,
      currency: args.p_currency as string,
      sessionId,
      paymentIntentId: (args.p_payment_intent_id as string | null) ?? null,
      receiptUrl: (args.p_receipt_url as string | null) ?? null,
    }
    db.creditGrants.set(sessionId, grant)
    return { data: { outcome: "granted", grant_id: grant.id, balance: creditBalance(grant.ownerId) }, error: null }
  }
  if (name !== "claim_design_credit") throw new Error(`unexpected rpc ${name}`)
  const owner = args.p_owner_id as string
  const letter = db.letters.get(args.p_letter_id as string)
  if (!letter || letter.ownerId !== owner || letter.kind !== "letter" || !letter.built) {
    return { data: { outcome: "letter_not_found", purchase_id: null, balance: null }, error: null }
  }
  if ([...db.purchases.values()].some((p) => p.letterId === letter.id && (p.status === "paid" || p.status === "designing"))) {
    return { data: { outcome: "in_progress", purchase_id: null, balance: null }, error: null }
  }
  const balance = creditBalance(owner)
  if (balance < 1) return { data: { outcome: "none_left", purchase_id: null, balance: 0 }, error: null }
  const p = addPurchase({
    ownerId: owner,
    letterId: letter.id,
    request: args.p_request as string,
    status: "paid",
    amountCents: 0,
    consentAt: now(),
    consentText: args.p_consent_text as string,
    paidWithCredit: true,
    paidAt: now(),
  })
  return { data: { outcome: "claimed", purchase_id: p.id, balance: balance - 1 }, error: null }
}

// claim_free_design and free_designs_left (0012_free_designs.sql) as the
// database answers them, on db.freeDays and db.purchases: the letter check,
// one run per letter, and used < limit.
export function freeDesignRpc(name: string, args: Record<string, unknown>): { data: unknown; error: null } {
  const key = `${args.p_day}|${args.p_ip_hash}`
  const limit = args.p_limit as number
  if (name === "free_designs_left") {
    return { data: Math.max(limit - (db.freeDays.get(key)?.used ?? 0), 0), error: null }
  }
  if (name !== "claim_free_design") throw new Error(`unexpected rpc ${name}`)
  const letter = db.letters.get(args.p_letter_id as string)
  if (!letter || letter.ownerId !== args.p_owner_id || letter.kind !== "letter" || !letter.built) {
    return { data: { outcome: "letter_not_found", purchase_id: null, uses_left: null }, error: null }
  }
  if ([...db.purchases.values()].some((p) => p.letterId === letter.id && (p.status === "paid" || p.status === "designing"))) {
    return { data: { outcome: "in_progress", purchase_id: null, uses_left: null }, error: null }
  }
  const counter = db.freeDays.get(key) ?? { day: args.p_day as string, ipHash: args.p_ip_hash as string, used: 0 }
  if (counter.used >= limit) return { data: { outcome: "used_up", purchase_id: null, uses_left: 0 }, error: null }
  counter.used++
  db.freeDays.set(key, counter)
  const p = addPurchase({
    ownerId: args.p_owner_id as string,
    letterId: letter.id,
    request: args.p_request as string,
    status: "paid",
    amountCents: 0,
    consentAt: null,
    consentText: null,
    freeDay: args.p_day as string,
    freeIpHash: args.p_ip_hash as string,
    paidAt: now(),
  })
  return { data: { outcome: "claimed", purchase_id: p.id, uses_left: limit - counter.used }, error: null }
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
  CREDITS_INTEGRATION_ID: "majnu_credits_test",
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
