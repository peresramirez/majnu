// Refunding a wrapper whose design could not be made. The buyer gets every
// cent back automatically (docs/business-plan.md, "Receipts and refunds"); a
// wrapper paid with a coupon code gets its code's use back instead, and never
// reaches Stripe (docs/features/coupons.md).
import "server-only"
import { markFailed, markRefunded, returnCouponUse, type Purchase } from "./purchases"
import { createStripeClient } from "./stripe"

export type RefundOutcome = { outcome: "refunded"; refundId: string } | { outcome: "failed"; reason: string }

export type GiveBackOutcome = RefundOutcome | { outcome: "code_returned" } | { outcome: "nothing_to_return" }

// What the design job calls when a run fails: a coupon purchase is marked
// failed and its code gets the use back (in one database call); a paid one is
// refunded through Stripe as below.
export async function giveBack(purchase: Pick<Purchase, "id" | "paymentIntentId" | "couponId">, reason: string): Promise<GiveBackOutcome> {
  if (purchase.couponId) {
    return (await returnCouponUse(purchase.id, reason)) ? { outcome: "code_returned" } : { outcome: "nothing_to_return" }
  }
  return refundPurchase(purchase, reason)
}

// Refunds the whole payment and records it. The idempotency key is the
// purchase id, so a retry (or a second caller) gets the same refund back from
// Stripe instead of a second one. If Stripe refuses, the purchase is marked
// failed with the reason, for a refund by hand.
export async function refundPurchase(purchase: Pick<Purchase, "id" | "paymentIntentId">, reason: string): Promise<RefundOutcome> {
  if (!purchase.paymentIntentId) {
    const why = `${reason}; no payment to refund was recorded`
    await markFailed(purchase.id, why)
    return { outcome: "failed", reason: why }
  }
  try {
    const refund = await createStripeClient().refunds.create(
      {
        payment_intent: purchase.paymentIntentId,
        reason: "requested_by_customer",
        metadata: { purchase_id: purchase.id },
      },
      { idempotencyKey: `majnu-wrapper-refund-${purchase.id}` },
    )
    await markRefunded(purchase.id, refund.id, reason)
    return { outcome: "refunded", refundId: refund.id }
  } catch (error) {
    const why = `${reason}; the refund failed: ${error instanceof Error ? error.message : String(error)}`
    await markFailed(purchase.id, why)
    return { outcome: "failed", reason: why }
  }
}
