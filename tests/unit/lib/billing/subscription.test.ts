// What a Stripe subscription means for the plan: active or trialing is Full
// moon, anything else is free, and the period end comes from the items.
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import type Stripe from "stripe"
import { periodEndOf, planStateOf } from "@/lib/billing/subscription"

const PERIOD_END = Date.UTC(2026, 11, 21, 10, 0, 0) / 1000 // 21 December 2026

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at: null,
    cancel_at_period_end: false,
    items: { object: "list", data: [{ current_period_end: PERIOD_END }], has_more: false, url: "" },
    ...overrides,
  } as unknown as Stripe.Subscription
}

describe("planStateOf", () => {
  it("gives Full moon to an active subscription, renewing at the item's period end", () => {
    expect(planStateOf(subscription())).toEqual({
      plan: "full-moon",
      subscriptionId: "sub_1",
      renewsAt: "2026-12-21T10:00:00.000Z",
      cancelAt: null,
    })
  })

  it("treats trialing as Full moon", () => {
    expect(planStateOf(subscription({ status: "trialing" })).plan).toBe("full-moon")
  })

  it.each(["incomplete", "incomplete_expired", "past_due", "unpaid", "paused", "canceled"] as const)(
    "treats %s as free and clears the dates",
    (status) => {
      expect(planStateOf(subscription({ status }))).toEqual({
        plan: "free",
        subscriptionId: "sub_1",
        renewsAt: null,
        cancelAt: null,
      })
    },
  )

  it("keeps Full moon until the period end when cancellation is scheduled (classic billing mode)", () => {
    const state = planStateOf(subscription({ cancel_at_period_end: true }))
    expect(state.plan).toBe("full-moon")
    expect(state.cancelAt).toBe("2026-12-21T10:00:00.000Z")
  })

  it("reads cancel_at when the portal schedules the cancellation that way (flexible billing mode)", () => {
    const state = planStateOf(subscription({ cancel_at: PERIOD_END }))
    expect(state.plan).toBe("full-moon")
    expect(state.cancelAt).toBe("2026-12-21T10:00:00.000Z")
    expect(state.renewsAt).toBe("2026-12-21T10:00:00.000Z")
  })
})

describe("periodEndOf", () => {
  it("uses the earliest item period end, and null without items", () => {
    const items = { object: "list", data: [{ current_period_end: 300 }, { current_period_end: 200 }], has_more: false, url: "" }
    expect(periodEndOf({ items } as unknown as Stripe.Subscription)).toBe(200)
    expect(periodEndOf({ items: { ...items, data: [] } } as unknown as Stripe.Subscription)).toBeNull()
  })
})
