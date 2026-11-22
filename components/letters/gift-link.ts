// The words on a gift card's link button (gift-card.tsx). Pure, so the
// wording can be tested (the test runner cannot load .tsx).
import type { Gift } from "@/lib/letters/schema"

// A code is redeemed: a voucher, a gift card. A link without one is usually
// a product in a shop, chosen in the gift finder, so it is seen, not redeemed.
export function giftLinkLabel(gift: Pick<Gift, "code">): string {
  return gift.code?.trim() ? "Redeem your gift" : "See the gift"
}
