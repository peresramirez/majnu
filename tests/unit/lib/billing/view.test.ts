// What the browser is told about a purchase (lib/billing/view.ts), for card
// purchases and for those made with a coupon code.
import { describe, expect, it } from "vitest"
import { FREE_WITH_CODE, STATUS_WORDS, statusWords, toPurchaseView } from "@/lib/billing/view"

const BASE = {
  id: "p1",
  status: "done" as const,
  request: "A night sky",
  createdAt: "2026-11-22T08:00:00.000Z",
  paidAt: "2026-11-22T08:00:00.000Z",
  finishedAt: null,
  amountCents: 299,
  currency: "eur",
  couponId: null,
  receiptUrl: "https://pay.stripe.com/receipts/r1",
  letter: { slug: "abc", title: "For Anna" },
}

describe("toPurchaseView", () => {
  it("shows the price and the receipt of a card purchase", () => {
    expect(toPurchaseView(BASE)).toMatchObject({ amount: "€2.99", freeWithCode: false, receiptUrl: "https://pay.stripe.com/receipts/r1", giftUrl: "/l/abc" })
  })

  it("shows a coupon purchase as free with a code, without a receipt", () => {
    const view = toPurchaseView({ ...BASE, amountCents: 0, couponId: "c1", receiptUrl: "https://pay.stripe.com/receipts/never" })
    expect(view).toMatchObject({ amount: FREE_WITH_CODE, freeWithCode: true, receiptUrl: null })
    expect(FREE_WITH_CODE).toBe("Free with a code")
  })
})

describe("statusWords", () => {
  it("uses the usual words for card purchases", () => {
    for (const status of ["paid", "designing", "done", "failed", "refunded"] as const) {
      expect(statusWords({ status, freeWithCode: false })).toEqual(STATUS_WORDS[status])
    }
  })

  it("never promises a refund for a coupon purchase", () => {
    expect(statusWords({ status: "failed", freeWithCode: true }).detail).toMatch(/code works again/)
    expect(statusWords({ status: "failed", freeWithCode: true }).detail).not.toMatch(/refund/i)
    expect(statusWords({ status: "paid", freeWithCode: true }).label).not.toMatch(/paid/i)
    expect(statusWords({ status: "designing", freeWithCode: true })).toEqual(STATUS_WORDS.designing)
  })
})
