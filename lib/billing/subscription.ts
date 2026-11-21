// What a Stripe subscription means for a Majnu plan. Pure, so it is unit-tested
// without Stripe or the database.
import "server-only"
import type Stripe from "stripe"
import { plans } from "@/lib/plans"

export type PlanId = typeof plans.free.id | typeof plans.fullMoon.id

export type PlanState = {
  plan: PlanId
  subscriptionId: string
  // The end of the current paid period (profiles.plan_renews_at): the next
  // renewal, unless cancelAt says it will not renew. Null when not active.
  renewsAt: string | null
  // When Full moon ends because the subscriber cancelled; null if it renews.
  cancelAt: string | null
}

// Active or trialing means the subscriber has Full moon. Everything else
// (incomplete, past_due, unpaid, paused, canceled, incomplete_expired) is free.
const ACTIVE_STATUSES = new Set<string>(["active", "trialing"])

export function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status)
}

export function customerIdOf(subscription: Pick<Stripe.Subscription, "customer">): string {
  const { customer } = subscription
  return typeof customer === "string" ? customer : customer.id
}

// Since API version 2025-03-31 the billing period lives on each subscription
// item (items.data[].current_period_end), not on the subscription. Full moon
// has one item; with several, the subscription renews at the earliest end.
export function periodEndOf(subscription: Pick<Stripe.Subscription, "items">): number | null {
  const ends = subscription.items.data.map((item) => item.current_period_end).filter((end) => Number.isFinite(end))
  return ends.length > 0 ? Math.min(...ends) : null
}

// A cancellation scheduled in the customer portal shows up either as
// cancel_at_period_end (classic billing mode) or as a cancel_at date
// (flexible billing mode). Either way the subscription stays active, and Full
// moon with it, until that date; then Stripe sends customer.subscription.deleted.
function scheduledCancelOf(subscription: Pick<Stripe.Subscription, "cancel_at" | "cancel_at_period_end">, periodEnd: number | null) {
  if (subscription.cancel_at) return subscription.cancel_at
  if (subscription.cancel_at_period_end) return periodEnd
  return null
}

const iso = (seconds: number | null) => (seconds === null ? null : new Date(seconds * 1000).toISOString())

export function planStateOf(
  subscription: Pick<Stripe.Subscription, "id" | "status" | "items" | "cancel_at" | "cancel_at_period_end">,
): PlanState {
  if (!isActiveStatus(subscription.status)) {
    return { plan: plans.free.id, subscriptionId: subscription.id, renewsAt: null, cancelAt: null }
  }
  const periodEnd = periodEndOf(subscription)
  const cancelAt = scheduledCancelOf(subscription, periodEnd)
  return {
    plan: plans.fullMoon.id,
    subscriptionId: subscription.id,
    renewsAt: iso(periodEnd),
    cancelAt: iso(cancelAt),
  }
}
