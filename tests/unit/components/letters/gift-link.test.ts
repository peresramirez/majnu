import { describe, expect, it } from "vitest"
import { giftLinkLabel } from "@/components/letters/gift-link"
import { letterFixtures } from "@/lib/letters/fixtures"

describe("giftLinkLabel (issue #59)", () => {
  it("redeems a gift that has a code", () => {
    expect(giftLinkLabel({ code: "SPA-2026-ANNA" })).toBe("Redeem your gift")
  })

  it("shows a shop product, which has a link and no code", () => {
    expect(giftLinkLabel({})).toBe("See the gift")
    expect(giftLinkLabel({ code: "  " })).toBe("See the gift")
  })

  it("redeems the gift reveal fixture's voucher", () => {
    const gift = letterFixtures["gift-reveal"].gifts[0]
    expect(giftLinkLabel(gift)).toBe(gift.code ? "Redeem your gift" : "See the gift")
  })
})
