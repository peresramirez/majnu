// The design job for a paid purchase, with the redesign (Daytona and the
// model) replaced by a fake, so no sandbox starts and no model is called.
// Stripe and the purchases table are the fakes in ./fakes.ts.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/billing/stripe", async () => (await import("./fakes")).stripeModule)
vi.mock("@/lib/billing/purchases", async () => (await import("./fakes")).purchasesModule)
// The real job would start a sandbox; every test passes its own `redesign`.
vi.mock("@/lib/daytona/redesign", () => ({
  redesignLetter: vi.fn(async () => {
    throw new Error("the real redesign must not run in tests")
  }),
}))

import { refundAbandonedPurchase, runPurchaseDesign } from "@/lib/billing/fulfil"
import { addPurchase, db, resetDb, resetStripe, stripe } from "./fakes"

const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"
const log = () => undefined

beforeEach(() => {
  resetDb()
  resetStripe()
})

function paid(overrides: Record<string, unknown> = {}) {
  return addPurchase({ letterId: LETTER, status: "paid", paymentIntentId: "pi_test_1", checkoutSessionId: "cs_test_1", ...overrides })
}

describe("runPurchaseDesign", () => {
  it("claims the purchase, makes the design and marks it done with the design", async () => {
    const purchase = paid({ request: "Pressed flowers on old paper" })
    const redesign = vi.fn(async (letterId: string, request: string) => {
      expect(db.purchases.get(purchase.id)?.status).toBe("designing")
      return { designId: `design-for-${letterId}-${request.length}`, seconds: 81 }
    })

    const outcome = await runPurchaseDesign(purchase.id, { redesign, log })

    expect(redesign).toHaveBeenCalledWith(LETTER, "Pressed flowers on old paper")
    expect(outcome).toEqual({ outcome: "done", designId: `design-for-${LETTER}-28`, seconds: 81 })
    expect(db.purchases.get(purchase.id)).toMatchObject({ status: "done", designId: `design-for-${LETTER}-28` })
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it("runs once however often it is started: a duplicate message finds it claimed", async () => {
    const purchase = paid()
    let finish: (value: { designId: string; seconds: number }) => void = () => undefined
    const redesign = vi.fn(() => new Promise<{ designId: string; seconds: number }>((resolve) => (finish = resolve)))

    const first = runPurchaseDesign(purchase.id, { redesign, log })
    const second = await runPurchaseDesign(purchase.id, { redesign, log })
    finish({ designId: "d1", seconds: 1 })
    await first

    expect(second).toEqual({ outcome: "skipped", reason: "the purchase is designing, not paid" })
    expect(await runPurchaseDesign(purchase.id, { redesign, log })).toMatchObject({ outcome: "skipped" })
    expect(redesign).toHaveBeenCalledTimes(1)
  })

  it("refunds the payment in full through Stripe when the run fails", async () => {
    const purchase = paid()
    const redesign = vi.fn(async () => {
      throw new Error("Claude Code failed (exit 1): usage limit reached")
    })

    const outcome = await runPurchaseDesign(purchase.id, { redesign, log })

    expect(outcome).toMatchObject({ outcome: "refunded" })
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1)
    expect(stripe.refunds.create).toHaveBeenCalledWith(
      { payment_intent: "pi_test_1", reason: "requested_by_customer", metadata: { purchase_id: purchase.id } },
      // The same key on every attempt: Stripe returns the first refund instead of making a second.
      { idempotencyKey: `majnu-wrapper-refund-${purchase.id}` },
    )
    expect(db.purchases.get(purchase.id)).toMatchObject({ status: "refunded", refundId: "re_test_1" })
    expect(db.purchases.get(purchase.id)?.failureReason).toMatch(/usage limit reached/)
  })

  it("marks the purchase failed, for a refund by hand, when the refund itself fails", async () => {
    const purchase = paid()
    stripe.refunds.create.mockRejectedValue(new Error("Stripe is down"))
    const outcome = await runPurchaseDesign(purchase.id, {
      redesign: async () => {
        throw new Error("sandbox did not start")
      },
      log,
    })
    expect(outcome).toMatchObject({ outcome: "refund_failed" })
    expect(db.purchases.get(purchase.id)?.status).toBe("failed")
    expect(db.purchases.get(purchase.id)?.failureReason).toMatch(/refund failed: Stripe is down/)
  })

  it("refunds when the gift was deleted before its design was made", async () => {
    const purchase = paid({ letterId: null })
    const redesign = vi.fn()
    expect(await runPurchaseDesign(purchase.id, { redesign, log })).toMatchObject({ outcome: "refunded" })
    expect(redesign).not.toHaveBeenCalled()
  })

  it("leaves a purchase that is not paid alone", async () => {
    const pending = addPurchase({ letterId: LETTER, status: "pending" })
    const redesign = vi.fn()
    expect(await runPurchaseDesign(pending.id, { redesign, log })).toEqual({ outcome: "skipped", reason: "the purchase is pending, not paid" })
    expect(await runPurchaseDesign("00000000-0000-4000-8000-999999999999", { redesign, log })).toEqual({ outcome: "skipped", reason: "no such purchase" })
    expect(redesign).not.toHaveBeenCalled()
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })
})

describe("refundAbandonedPurchase (the dead-letter queue)", () => {
  it("refunds a purchase whose run never finished", async () => {
    const purchase = paid({ status: "designing" })
    expect(await refundAbandonedPurchase(purchase.id, { log })).toMatchObject({ outcome: "refunded" })
    expect(db.purchases.get(purchase.id)?.status).toBe("refunded")
  })

  it("never refunds a design that was made, or one already refunded", async () => {
    const done = paid({ status: "done", designId: "d1" })
    const refunded = paid({ status: "refunded", letterId: "11111111-2222-4333-8444-555555555555" })
    expect(await refundAbandonedPurchase(done.id, { log })).toMatchObject({ outcome: "skipped" })
    expect(await refundAbandonedPurchase(refunded.id, { log })).toMatchObject({ outcome: "skipped" })
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })
})

describe("a purchase paid with a coupon code", () => {
  const COUPON = "c0000000-0000-4000-8000-000000000001"

  function redeemed(overrides: Record<string, unknown> = {}) {
    db.coupons.set(COUPON, { id: COUPON, uses: 1, maxUses: 1 })
    return addPurchase({ letterId: LETTER, status: "paid", couponId: COUPON, amountCents: 0, consentAt: null, consentText: null, ...overrides })
  }

  it("runs like a paid one and keeps the use when the design is made", async () => {
    const purchase = redeemed()
    const outcome = await runPurchaseDesign(purchase.id, { redesign: async () => ({ designId: "d1", seconds: 70 }), log })
    expect(outcome).toEqual({ outcome: "done", designId: "d1", seconds: 70 })
    expect(db.purchases.get(purchase.id)?.status).toBe("done")
    expect(db.coupons.get(COUPON)?.uses).toBe(1)
  })

  it("gives the use back and marks the purchase failed when the run fails, without calling Stripe", async () => {
    const purchase = redeemed()
    const outcome = await runPurchaseDesign(purchase.id, {
      redesign: async () => {
        throw new Error("sandbox did not start")
      },
      log,
    })
    expect(outcome).toMatchObject({ outcome: "code_returned", reason: expect.stringMatching(/sandbox did not start/) })
    expect(db.purchases.get(purchase.id)).toMatchObject({ status: "failed", refundId: null })
    expect(db.purchases.get(purchase.id)?.failureReason).toMatch(/sandbox did not start/)
    expect(db.coupons.get(COUPON)?.uses).toBe(0)
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it("gives the use back once when the dead-letter queue finds the run abandoned", async () => {
    const purchase = redeemed({ status: "designing" })
    expect(await refundAbandonedPurchase(purchase.id, { log })).toMatchObject({ outcome: "code_returned" })
    expect(db.coupons.get(COUPON)?.uses).toBe(0)
    // A second delivery finds it failed and changes nothing.
    expect(await refundAbandonedPurchase(purchase.id, { log })).toMatchObject({ outcome: "skipped" })
    expect(db.coupons.get(COUPON)?.uses).toBe(0)
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it("never reaches Stripe even when the gift was deleted before its design", async () => {
    const purchase = redeemed({ letterId: null })
    const redesign = vi.fn()
    expect(await runPurchaseDesign(purchase.id, { redesign, log })).toMatchObject({ outcome: "code_returned" })
    expect(redesign).not.toHaveBeenCalled()
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })
})

describe("one of the day's free designs (docs/features/free-designs.md)", () => {
  const HASH = "a".repeat(64)
  const DAY = "2026-11-22"

  function claimed(overrides: Record<string, unknown> = {}) {
    db.freeDays.set(`${DAY}|${HASH}`, { day: DAY, ipHash: HASH, used: 1 })
    return addPurchase({ letterId: LETTER, status: "paid", freeDay: DAY, freeIpHash: HASH, amountCents: 0, consentAt: null, consentText: null, ...overrides })
  }

  it("runs like a paid one, keeps the use and forgets the address hash when the design is made", async () => {
    const purchase = claimed()
    const outcome = await runPurchaseDesign(purchase.id, { redesign: async () => ({ designId: "d1", seconds: 70 }), log })
    expect(outcome).toEqual({ outcome: "done", designId: "d1", seconds: 70 })
    expect(db.purchases.get(purchase.id)).toMatchObject({ status: "done", freeIpHash: null, freeDay: DAY })
    expect(db.freeDays.get(`${DAY}|${HASH}`)?.used).toBe(1)
  })

  it("gives the free design back and marks the purchase failed when the run fails, without calling Stripe", async () => {
    const purchase = claimed()
    const outcome = await runPurchaseDesign(purchase.id, {
      redesign: async () => {
        throw new Error("sandbox did not start")
      },
      log,
    })
    expect(outcome).toMatchObject({ outcome: "free_returned", reason: expect.stringMatching(/sandbox did not start/) })
    expect(db.purchases.get(purchase.id)).toMatchObject({ status: "failed", refundId: null, freeIpHash: null })
    expect(db.freeDays.get(`${DAY}|${HASH}`)?.used).toBe(0)
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it("gives it back once when the dead-letter queue finds the run abandoned", async () => {
    const purchase = claimed({ status: "designing" })
    expect(await refundAbandonedPurchase(purchase.id, { log })).toMatchObject({ outcome: "free_returned" })
    expect(await refundAbandonedPurchase(purchase.id, { log })).toMatchObject({ outcome: "skipped" })
    expect(db.freeDays.get(`${DAY}|${HASH}`)?.used).toBe(0)
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it("never reaches Stripe even when the gift was deleted before its design", async () => {
    const purchase = claimed({ letterId: null })
    const redesign = vi.fn()
    expect(await runPurchaseDesign(purchase.id, { redesign, log })).toMatchObject({ outcome: "free_returned" })
    expect(redesign).not.toHaveBeenCalled()
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })
})
