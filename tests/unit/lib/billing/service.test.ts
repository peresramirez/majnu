// The personalised wrapper's payment rules, with Stripe, the purchases table
// and the design queue replaced by fakes (./fakes.ts): Checkout in payment
// mode only with consent, what the return page trusts, and webhook events
// applied once however often they arrive.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/billing/stripe", async () => (await import("./fakes")).stripeModule)
vi.mock("@/lib/billing/purchases", async () => (await import("./fakes")).purchasesModule)
vi.mock("@/lib/billing/queue", () => ({ enqueueDesign: vi.fn(async () => "queued") }))

import type Stripe from "stripe"
import { enqueueDesign } from "@/lib/billing/queue"
import { applyPaidSession, cleanWrapperRequest, confirmCheckout, handleStripeEvent, HANDLED_EVENTS, startWrapperCheckout } from "@/lib/billing/service"
import { WRAPPER_CONSENT_TEXT, WRAPPER_REQUEST_MAX_CHARS } from "@/lib/plans"
import { addLetter, addPurchase, db, paidSession, purchasesModule, resetDb, resetStripe, stripe } from "./fakes"

const SITE = "https://majnu.app"
const USER = { id: "user-1", email: "anna@example.com", isAnonymous: false }
const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"
const INPUT = { letterId: LETTER, request: "A 1950s cinema ticket by the sea", consent: true, returnTo: `/create/${LETTER}` }

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("STRIPE_PRICE_WRAPPER", "price_test_wrapper")
  vi.mocked(enqueueDesign).mockClear()
  Object.values(purchasesModule).forEach((fn) => fn.mockClear())
  resetDb()
  resetStripe()
  addLetter(LETTER)
  stripe.checkout.sessions.create.mockImplementation(async () => ({ id: "cs_test_new", url: "https://checkout.stripe.com/c/pay/cs_test_new" }))
})

function event(type: string, object: Record<string, unknown>): Stripe.Event {
  return { id: `evt_${type}`, object: "event", type, data: { object } } as unknown as Stripe.Event
}

// A purchase that went through Checkout: pending, with its session.
function openedPurchase(overrides: Partial<Parameters<typeof addPurchase>[0]> = {}) {
  return addPurchase({ checkoutSessionId: `cs_test_session${db.seq + 1}abcdefghij`, ...overrides, letterId: overrides.letterId ?? LETTER })
}

describe("startWrapperCheckout", () => {
  it("opens Checkout in payment mode for the wrapper price, tied to a pending purchase with the consent on file", async () => {
    const before = Date.now()
    const result = await startWrapperCheckout(USER, INPUT, SITE)

    expect(result).toEqual({ kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_new", purchaseId: expect.any(String) })
    if (result.kind !== "redirect") throw new Error("expected a redirect")

    const stored = db.purchases.get(result.purchaseId)!
    expect(stored).toMatchObject({
      ownerId: "user-1",
      letterId: LETTER,
      status: "pending",
      request: INPUT.request,
      consentText: WRAPPER_CONSENT_TEXT,
      amountCents: 299,
      currency: "eur",
      checkoutSessionId: "cs_test_new",
    })
    expect(Date.parse(stored.consentAt)).toBeGreaterThanOrEqual(before - 1000)

    const [params, options] = stripe.checkout.sessions.create.mock.calls[0]
    expect(params).toMatchObject({
      mode: "payment",
      line_items: [{ price: "price_test_wrapper", quantity: 1 }],
      client_reference_id: "user-1",
      customer_email: "anna@example.com",
      metadata: { purchase_id: result.purchaseId, letter_id: LETTER, user_id: "user-1" },
      payment_intent_data: { metadata: { purchase_id: result.purchaseId } },
      success_url: `${SITE}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE}/create/${LETTER}`,
      integration_identifier: "majnu_wrapper_test",
      // Majnu stays the seller: Managed Payments is off for the session.
      managed_payments: { enabled: false },
    })
    // Never a subscription, and no hard-coded payment methods.
    expect(params.mode).not.toBe("subscription")
    expect(params).not.toHaveProperty("payment_method_types")
    expect(params).not.toHaveProperty("subscription_data")
    expect(params.expires_at).toBeGreaterThan(before / 1000)
    expect(options).toEqual({ idempotencyKey: `majnu-wrapper-checkout-${result.purchaseId}` })
  })

  it.each([
    ["missing", undefined],
    ["false", false],
    ["the string true", "true"],
    ["1", 1],
  ])("refuses without the consent box ticked (%s), before recording anything or calling Stripe", async (_label, consent) => {
    const result = await startWrapperCheckout(USER, { ...INPUT, consent }, SITE)
    expect(result).toMatchObject({ kind: "refused", reason: "consent_required" })
    expect(db.purchases.size).toBe(0)
    expect(purchasesModule.getMyLetterForWrapper).not.toHaveBeenCalled()
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("stores the server's consent sentence, never text the browser sent", async () => {
    const result = await startWrapperCheckout(USER, { ...INPUT, consentText: "I agree to nothing" } as typeof INPUT, SITE)
    if (result.kind !== "redirect") throw new Error("expected a redirect")
    expect(db.purchases.get(result.purchaseId)?.consentText).toBe(WRAPPER_CONSENT_TEXT)
  })

  it.each([
    ["empty", ""],
    ["too short", "ab"],
    ["too long", "x".repeat(WRAPPER_REQUEST_MAX_CHARS + 1)],
    ["not text", { look: "nice" }],
  ])("refuses a design request that is %s", async (_label, request) => {
    expect(await startWrapperCheckout(USER, { ...INPUT, request }, SITE)).toMatchObject({ kind: "refused", reason: "invalid_request" })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("asks a guest to create an account first, without reading the letter", async () => {
    const result = await startWrapperCheckout({ ...USER, isAnonymous: true }, INPUT, SITE)
    expect(result).toMatchObject({ kind: "refused", reason: "account_required" })
    expect(purchasesModule.getMyLetterForWrapper).not.toHaveBeenCalled()
  })

  it("refuses someone else's letter, a calendar and a letter that is not built", async () => {
    db.currentUser = "user-2"
    expect(await startWrapperCheckout({ ...USER, id: "user-2" }, INPUT, SITE)).toMatchObject({ reason: "letter_not_found" })
    db.currentUser = "user-1"
    addLetter(LETTER, { kind: "calendar" })
    expect(await startWrapperCheckout(USER, INPUT, SITE)).toMatchObject({ reason: "not_a_letter" })
    addLetter(LETTER, { built: false })
    expect(await startWrapperCheckout(USER, INPUT, SITE)).toMatchObject({ reason: "not_built" })
    expect(await startWrapperCheckout(USER, { ...INPUT, letterId: "not-a-uuid" }, SITE)).toMatchObject({ reason: "letter_not_found" })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("refuses while a paid design for the letter is on its way", async () => {
    addPurchase({ letterId: LETTER, status: "designing" })
    expect(await startWrapperCheckout(USER, INPUT, SITE)).toMatchObject({ kind: "refused", reason: "in_progress" })
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("expires an earlier unpaid Checkout for the same letter, so one gift is not paid for twice", async () => {
    const earlier = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue({ id: earlier.checkoutSessionId, status: "open", mode: "payment" })
    const result = await startWrapperCheckout(USER, INPUT, SITE)
    expect(result.kind).toBe("redirect")
    expect(stripe.checkout.sessions.expire).toHaveBeenCalledWith(earlier.checkoutSessionId)
    expect(db.purchases.has(earlier.id)).toBe(false)
  })

  it("applies an earlier Checkout that was paid but not recorded yet, instead of selling a second wrapper", async () => {
    const earlier = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(earlier))
    const result = await startWrapperCheckout(USER, INPUT, SITE)
    expect(result).toMatchObject({ kind: "refused", reason: "in_progress" })
    expect(db.purchases.get(earlier.id)?.status).toBe("paid")
    expect(enqueueDesign).toHaveBeenCalledWith(earlier.id)
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it("removes the pending purchase and rethrows when Stripe fails", async () => {
    stripe.checkout.sessions.create.mockRejectedValue(new Error("Stripe is down"))
    await expect(startWrapperCheckout(USER, INPUT, SITE)).rejects.toThrow("Stripe is down")
    expect(db.purchases.size).toBe(0)
  })

  it("only returns to a same-site page after a cancelled Checkout", async () => {
    await startWrapperCheckout(USER, { ...INPUT, returnTo: "//evil.example/x" }, SITE)
    expect(stripe.checkout.sessions.create.mock.calls[0][0].cancel_url).toBe(`${SITE}/dashboard/purchases`)
  })
})

describe("cleanWrapperRequest", () => {
  it("keeps plain text and drops control characters", () => {
    expect(cleanWrapperRequest("  Pressed flowers\r\n\u0007on old paper  ")).toBe("Pressed flowers\non old paper")
  })
})

describe("the webhook", () => {
  it("subscribes to the Checkout events of a one-time payment and nothing about subscriptions", () => {
    expect([...HANDLED_EVENTS].sort()).toEqual(
      ["checkout.session.async_payment_failed", "checkout.session.async_payment_succeeded", "checkout.session.completed", "checkout.session.expired"].sort(),
    )
  })

  it("marks a paid checkout paid from Stripe's current session, with the receipt, and starts the design", async () => {
    const purchase = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(purchase))
    const outcome = await handleStripeEvent(event("checkout.session.completed", { id: purchase.checkoutSessionId, mode: "payment", payment_status: "paid", metadata: { purchase_id: purchase.id } }))

    expect(outcome).toEqual({ outcome: "applied", status: "paid" })
    expect(stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(purchase.checkoutSessionId, { expand: ["payment_intent.latest_charge"] })
    expect(db.purchases.get(purchase.id)).toMatchObject({
      status: "paid",
      paymentIntentId: `pi_test_${purchase.id.slice(-4)}`,
      receiptUrl: "https://pay.stripe.com/receipts/r1",
      amountCents: 299,
    })
    expect(enqueueDesign).toHaveBeenCalledWith(purchase.id)
  })

  it("is idempotent: a replayed event changes nothing, and none starts a second design once the job has it", async () => {
    const purchase = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(purchase))
    const completed = event("checkout.session.completed", { id: purchase.checkoutSessionId, mode: "payment", payment_status: "paid", metadata: { purchase_id: purchase.id } })

    await handleStripeEvent(completed)
    const paidAt = db.purchases.get(purchase.id)?.paidAt
    // The job claims it (paid → designing).
    await purchasesModule.claimForDesign(purchase.id)
    vi.mocked(enqueueDesign).mockClear()

    await handleStripeEvent(completed)
    await handleStripeEvent(event("checkout.session.async_payment_succeeded", completed.data.object as unknown as Record<string, unknown>))

    expect(db.purchases.get(purchase.id)).toMatchObject({ status: "designing", paidAt })
    expect(enqueueDesign).not.toHaveBeenCalled()
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it("waits for a delayed payment method: an unpaid completed session is not fulfilled", async () => {
    const purchase = openedPurchase()
    const outcome = await handleStripeEvent(
      event("checkout.session.completed", { id: purchase.checkoutSessionId, mode: "payment", payment_status: "unpaid", metadata: { purchase_id: purchase.id } }),
    )
    expect(outcome.outcome).toBe("ignored")
    expect(db.purchases.get(purchase.id)?.status).toBe("pending")
    expect(enqueueDesign).not.toHaveBeenCalled()
  })

  it("fulfils a delayed payment when it succeeds", async () => {
    const purchase = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(purchase))
    await handleStripeEvent(
      event("checkout.session.async_payment_succeeded", { id: purchase.checkoutSessionId, mode: "payment", payment_status: "paid", metadata: { purchase_id: purchase.id } }),
    )
    expect(db.purchases.get(purchase.id)?.status).toBe("paid")
  })

  it("never lets a session pay for a purchase it was not opened for", async () => {
    const purchase = openedPurchase()
    const other = openedPurchase({ letterId: "11111111-2222-4333-8444-555555555555" })
    // A session whose metadata names `purchase` but which is `other`'s session.
    stripe.checkout.sessions.retrieve.mockResolvedValue({ ...paidSession(purchase), id: other.checkoutSessionId })
    await handleStripeEvent(event("checkout.session.completed", { id: other.checkoutSessionId, mode: "payment", payment_status: "paid", metadata: { purchase_id: purchase.id } }))
    expect(db.purchases.get(purchase.id)?.status).toBe("pending")
    expect(enqueueDesign).not.toHaveBeenCalled()
  })

  it("refunds a second payment for a letter whose design is already being made", async () => {
    addPurchase({ letterId: LETTER, status: "designing" })
    const second = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(second))
    const outcome = await handleStripeEvent(event("checkout.session.completed", { id: second.checkoutSessionId, mode: "payment", payment_status: "paid", metadata: { purchase_id: second.id } }))

    expect(outcome).toEqual({ outcome: "applied", status: "refunded" })
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: `pi_test_${second.id.slice(-4)}`, reason: "requested_by_customer", metadata: { purchase_id: second.id } },
      { idempotencyKey: `majnu-wrapper-refund-${second.id}` },
    )
    expect(db.purchases.get(second.id)).toMatchObject({ status: "refunded", refundId: "re_test_1" })
    expect(enqueueDesign).not.toHaveBeenCalled()
  })

  it("forgets a Checkout that expired or whose delayed payment failed, but never a paid purchase", async () => {
    const abandoned = openedPurchase()
    const paid = addPurchase({ letterId: LETTER, status: "done", designId: "d1" })
    await handleStripeEvent(event("checkout.session.expired", { id: "cs_x", metadata: { purchase_id: abandoned.id } }))
    await handleStripeEvent(event("checkout.session.async_payment_failed", { id: "cs_y", metadata: { purchase_id: paid.id } }))
    expect(db.purchases.has(abandoned.id)).toBe(false)
    expect(db.purchases.get(paid.id)?.status).toBe("done")
  })

  it("ignores subscription events and checkouts that are not wrappers", async () => {
    expect((await handleStripeEvent(event("customer.subscription.updated", { id: "sub_1" }))).outcome).toBe("ignored")
    expect((await handleStripeEvent(event("checkout.session.completed", { id: "cs_1", mode: "subscription", metadata: {} }))).outcome).toBe("ignored")
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled()
  })
})

describe("confirmCheckout (the return page)", () => {
  it("marks the sender's paid session paid and starts the design, as the webhook would", async () => {
    const purchase = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(purchase))
    expect(await confirmCheckout({ id: "user-1" }, purchase.checkoutSessionId)).toEqual({ outcome: "paid", purchaseId: purchase.id })
    expect(db.purchases.get(purchase.id)?.status).toBe("paid")
    expect(enqueueDesign).toHaveBeenCalledWith(purchase.id)
  })

  it("does nothing more when the webhook was first", async () => {
    const purchase = openedPurchase({ status: "designing" })
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(purchase))
    expect(await confirmCheckout({ id: "user-1" }, purchase.checkoutSessionId)).toEqual({ outcome: "paid", purchaseId: purchase.id })
    expect(purchasesModule.markPaid).not.toHaveBeenCalled()
  })

  it("refuses another user's session, without changing it", async () => {
    const purchase = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(purchase))
    expect(await confirmCheckout({ id: "user-2" }, purchase.checkoutSessionId)).toEqual({ outcome: "not_found" })
    expect(db.purchases.get(purchase.id)?.status).toBe("pending")
  })

  it("says a complete but unpaid session is processing, and an open one was not paid", async () => {
    const purchase = openedPurchase()
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(purchase, { payment_status: "unpaid" }))
    expect(await confirmCheckout({ id: "user-1" }, purchase.checkoutSessionId)).toEqual({ outcome: "processing", purchaseId: purchase.id })
    stripe.checkout.sessions.retrieve.mockResolvedValue(paidSession(purchase, { status: "open", payment_status: "unpaid" }))
    expect(await confirmCheckout({ id: "user-1" }, purchase.checkoutSessionId)).toEqual({ outcome: "not_found" })
    expect(db.purchases.get(purchase.id)?.status).toBe("pending")
  })

  it("does not ask Stripe about something that is not a session id", async () => {
    expect(await confirmCheckout({ id: "user-1" }, "https://evil.example")).toEqual({ outcome: "not_found" })
    expect(await confirmCheckout({ id: "user-1" }, null)).toEqual({ outcome: "not_found" })
    expect(stripe.checkout.sessions.retrieve).not.toHaveBeenCalled()
  })
})

describe("applyPaidSession", () => {
  it("ignores sessions that are not paid or not ours", async () => {
    const purchase = openedPurchase()
    expect(await applyPaidSession(paidSession(purchase, { metadata: {} }) as unknown as Stripe.Checkout.Session)).toBeNull()
    expect(await applyPaidSession(paidSession(purchase, { payment_status: "unpaid" }) as unknown as Stripe.Checkout.Session)).toBeNull()
    expect(db.purchases.get(purchase.id)?.status).toBe("pending")
  })
})
