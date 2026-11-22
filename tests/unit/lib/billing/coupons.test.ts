// Redeeming a coupon code (lib/billing/coupons.ts), with the database call,
// the purchases table, the design queue and Stripe replaced by fakes. The
// database function itself (atomic uses, expiry, disabled codes, the last use
// under concurrency) was checked against Postgres; see docs/features/coupons.md.
import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/billing/stripe", async () => {
  const { vi } = await import("vitest")
  return {
    createStripeClient: vi.fn(() => {
      throw new Error("the coupon path must not create a Stripe client")
    }),
    wrapperPriceId: vi.fn(() => "price_test"),
    CHECKOUT_INTEGRATION_ID: "majnu_wrapper_test",
  }
})
vi.mock("@/lib/billing/purchases", async () => (await import("./fakes")).purchasesModule)
vi.mock("@/lib/billing/my-purchases", async () => (await import("./fakes")).myPurchasesModule)
vi.mock("@/lib/billing/queue", () => ({ enqueueDesign: vi.fn(async () => "queued") }))

// redeem_coupon, as the database answers it.
const rpc = vi.fn()
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ rpc: (name: string, args: unknown) => ({ single: () => rpc(name, args) }) }),
}))

import { redeemWrapperCoupon } from "@/lib/billing/coupons"
import { enqueueDesign } from "@/lib/billing/queue"
import { createStripeClient } from "@/lib/billing/stripe"
import { addLetter, addPurchase, db, purchasesModule, resetDb, stripe } from "./fakes"

const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"
const COUPON = "c0000000-0000-4000-8000-000000000001"
const GUEST = { id: "user-1" }
const INPUT = { letterId: LETTER, request: "  A night sky with our two stars  ", coupon: "k7qm 3xra-pd9c whte" }

// What the function does on "redeemed": a paid purchase with amount 0.
function redeemsAs() {
  rpc.mockImplementation(async (_name: string, args: { p_owner_id: string; p_letter_id: string; p_request: string }) => {
    db.coupons.set(COUPON, { id: COUPON, uses: 1, maxUses: 1 })
    const p = addPurchase({
      ownerId: args.p_owner_id,
      letterId: args.p_letter_id,
      request: args.p_request,
      status: "paid",
      couponId: COUPON,
      amountCents: 0,
      consentAt: null,
      consentText: null,
      paidAt: new Date().toISOString(),
    })
    return { data: { outcome: "redeemed", purchase_id: p.id }, error: null }
  })
}

beforeEach(() => {
  vi.mocked(enqueueDesign).mockReset().mockResolvedValue("queued")
  vi.mocked(createStripeClient).mockClear()
  Object.values(purchasesModule).forEach((fn) => fn.mockClear())
  rpc.mockReset()
  resetDb()
  addLetter(LETTER)
  redeemsAs()
})

describe("redeemWrapperCoupon", () => {
  it("records the purchase through redeem_coupon with the hash of the normalised code and starts the design", async () => {
    const result = await redeemWrapperCoupon(GUEST, INPUT)

    expect(result.kind).toBe("redeemed")
    if (result.kind !== "redeemed") throw new Error("expected a redemption")
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith("redeem_coupon", {
      p_code_hash: createHash("sha256").update("K7QM3XRAPD9CWHTE").digest("hex"),
      p_owner_id: "user-1",
      p_letter_id: LETTER,
      p_request: "A night sky with our two stars",
    })
    expect(result.purchase).toMatchObject({ status: "paid", couponId: COUPON, amountCents: 0, consentAt: null, letterId: LETTER })
    expect(result.letter.slug).toBe(`slug-${LETTER.slice(0, 6)}`)
    // Exactly as a paid purchase: handed to the design queue.
    expect(enqueueDesign).toHaveBeenCalledWith(result.purchase.id)
  })

  it("never calls Stripe", async () => {
    await redeemWrapperCoupon(GUEST, INPUT)
    expect(createStripeClient).not.toHaveBeenCalled()
    expect(stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(stripe.refunds.create).not.toHaveBeenCalled()
  })

  it.each([
    ["invalid", "code_invalid", /doesn't work/],
    ["used_up", "code_used_up", /used as many times/],
    ["expired", "code_expired", /expired/],
    ["already_redeemed", "code_already_used", /already used this code/],
    ["in_progress", "in_progress", /already being made/],
    ["letter_not_found", "letter_not_found", /couldn't find/],
    ["something new", "code_invalid", /doesn't work/],
  ])("answers the database's %s as %s, and starts nothing", async (outcome, reason, message) => {
    rpc.mockResolvedValue({ data: { outcome, purchase_id: null }, error: null })
    const result = await redeemWrapperCoupon(GUEST, INPUT)
    expect(result).toEqual({ kind: "refused", reason, message: expect.stringMatching(message) })
    expect(enqueueDesign).not.toHaveBeenCalled()
  })

  it("does not ask the database about something that cannot be a code", async () => {
    for (const coupon of ["", "   ", "short", 42, null, "K7QM-3XRA-PD9C-WH!E"]) {
      expect(await redeemWrapperCoupon(GUEST, { ...INPUT, coupon })).toMatchObject({ kind: "refused", reason: "code_invalid" })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it("refuses a missing or too long request, as Checkout does", async () => {
    for (const request of ["", "ab", "x".repeat(501), 7]) {
      expect(await redeemWrapperCoupon(GUEST, { ...INPUT, request })).toMatchObject({ kind: "refused", reason: "invalid_request" })
    }
    expect(rpc).not.toHaveBeenCalled()
  })

  it("refuses another person's letter, a calendar and an unbuilt letter before taking a use", async () => {
    db.currentUser = "someone-else"
    expect(await redeemWrapperCoupon(GUEST, INPUT)).toMatchObject({ reason: "letter_not_found" })
    db.currentUser = "user-1"
    addLetter(LETTER, { kind: "calendar" })
    expect(await redeemWrapperCoupon(GUEST, INPUT)).toMatchObject({ reason: "not_a_letter" })
    addLetter(LETTER, { built: false })
    expect(await redeemWrapperCoupon(GUEST, INPUT)).toMatchObject({ reason: "not_built" })
    expect(await redeemWrapperCoupon(GUEST, { ...INPUT, letterId: "not-a-uuid" })).toMatchObject({ reason: "letter_not_found" })
    expect(rpc).not.toHaveBeenCalled()
  })

  it("gives the use back when the design cannot be handed to the queue", async () => {
    vi.mocked(enqueueDesign).mockRejectedValue(new Error("queue unavailable"))
    await expect(redeemWrapperCoupon(GUEST, INPUT)).rejects.toThrow("queue unavailable")
    const [purchase] = [...db.purchases.values()]
    expect(purchasesModule.returnCouponUse).toHaveBeenCalledWith(purchase.id, expect.stringMatching(/queue unavailable/))
    expect(purchase.status).toBe("failed")
    expect(db.coupons.get(COUPON)?.uses).toBe(0)
  })

  it("throws when the database call fails, so the route answers 502", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "connection reset" } })
    await expect(redeemWrapperCoupon(GUEST, INPUT)).rejects.toThrow(/connection reset/)
    expect(enqueueDesign).not.toHaveBeenCalled()
  })
})
