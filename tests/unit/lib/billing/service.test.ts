// The billing rules with Stripe and the profiles table replaced by fakes:
// who may check out, what the return page trusts, and that webhook events are
// applied idempotently from Stripe's current state, not the event snapshot.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const fakes = vi.hoisted(() => {
  type Profile = {
    userId: string
    plan: "free" | "full-moon"
    stripeCustomerId: string | null
    stripeSubscriptionId: string | null
    planRenewsAt: string | null
    planCancelAt: string | null
  }
  const profiles = new Map<string, Profile>()
  const writes: unknown[] = []
  const stripe = {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn(), retrieve: vi.fn() } },
    subscriptions: { list: vi.fn(), retrieve: vi.fn() },
    billingPortal: { sessions: { create: vi.fn() } },
  }
  return { profiles, writes, stripe }
})

vi.mock("@/lib/billing/stripe", () => ({
  createStripeClient: () => fakes.stripe,
  fullMoonPriceId: () => {
    const id = process.env.STRIPE_PRICE_FULL_MOON
    if (!id) throw new Error("STRIPE_PRICE_FULL_MOON is not set")
    return id
  },
  CHECKOUT_INTEGRATION_ID: "majnu_full_moon_test",
}))

vi.mock("@/lib/billing/profiles", () => ({
  getBillingProfile: async (userId: string) => fakes.profiles.get(userId) ?? null,
  getBillingProfileByCustomer: async (customerId: string) =>
    [...fakes.profiles.values()].find((p) => p.stripeCustomerId === customerId) ?? null,
  saveCustomerId: async (userId: string, customerId: string) => {
    const profile = fakes.profiles.get(userId)
    if (profile?.stripeCustomerId) return profile.stripeCustomerId
    fakes.profiles.set(userId, { ...(profile ?? blankProfile(userId)), stripeCustomerId: customerId })
    return customerId
  },
  savePlanState: async (
    userId: string,
    state: { plan: "free" | "full-moon"; subscriptionId: string; renewsAt: string | null; cancelAt: string | null },
  ) => {
    fakes.writes.push({ userId, ...state })
    const profile = fakes.profiles.get(userId) ?? blankProfile(userId)
    fakes.profiles.set(userId, {
      ...profile,
      plan: state.plan,
      stripeSubscriptionId: state.subscriptionId,
      planRenewsAt: state.renewsAt,
      planCancelAt: state.cancelAt,
    })
  },
}))

function blankProfile(userId: string): BillingProfile {
  return {
    userId,
    plan: "free",
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    planRenewsAt: null,
    planCancelAt: null,
  }
}

import type Stripe from "stripe"
import type { BillingProfile } from "@/lib/billing/profiles"
import { confirmCheckout, handleStripeEvent, openPortal, startCheckout } from "@/lib/billing/service"

const USER = { id: "user-1", email: "anna@example.com" }
const SITE = "https://majnu.app"
const PERIOD_END = Date.UTC(2026, 11, 21) / 1000
const SESSION_ID = "cs_test_a1B2c3D4e5F6g7H8"

function subscription(overrides: Partial<Stripe.Subscription> = {}): Stripe.Subscription {
  return {
    id: "sub_1",
    object: "subscription",
    status: "active",
    customer: "cus_1",
    cancel_at: null,
    cancel_at_period_end: false,
    items: { object: "list", data: [{ current_period_end: PERIOD_END }], has_more: false, url: "" },
    ...overrides,
  } as unknown as Stripe.Subscription
}

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: SESSION_ID,
    object: "checkout.session",
    mode: "subscription",
    status: "complete",
    payment_status: "paid",
    client_reference_id: USER.id,
    customer: "cus_1",
    subscription: subscription(),
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

function event(type: string, object: unknown): Stripe.Event {
  return { id: `evt_${type}`, object: "event", type, data: { object } } as unknown as Stripe.Event
}

function giveProfile(overrides: Partial<BillingProfile> = {}) {
  fakes.profiles.set(USER.id, { ...blankProfile(USER.id), ...overrides })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("STRIPE_PRICE_FULL_MOON", "price_test_full_moon")
  fakes.profiles.clear()
  fakes.writes.length = 0
  fakes.stripe.customers.create.mockResolvedValue({ id: "cus_new" })
  fakes.stripe.checkout.sessions.create.mockResolvedValue({ id: SESSION_ID, url: "https://checkout.stripe.com/c/pay/cs_test" })
  fakes.stripe.subscriptions.list.mockResolvedValue({ data: [] })
})

describe("startCheckout", () => {
  it("creates the customer once, stores it, and opens a subscription Checkout for the configured price", async () => {
    giveProfile()
    const result = await startCheckout(USER, SITE)

    expect(result).toEqual({ kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test" })
    expect(fakes.stripe.customers.create).toHaveBeenCalledWith(
      { email: "anna@example.com", metadata: { user_id: "user-1" } },
      { idempotencyKey: "majnu-customer-user-1" },
    )
    expect(fakes.profiles.get(USER.id)?.stripeCustomerId).toBe("cus_new")

    const params = fakes.stripe.checkout.sessions.create.mock.calls[0][0]
    expect(params).toMatchObject({
      mode: "subscription",
      customer: "cus_new",
      client_reference_id: "user-1",
      line_items: [{ price: "price_test_full_moon", quantity: 1 }],
      success_url: "https://majnu.app/billing/return?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://majnu.app/dashboard/plan",
      integration_identifier: "majnu_full_moon_test",
    })
    expect(params).not.toHaveProperty("payment_method_types")
  })

  it("reuses a stored customer", async () => {
    giveProfile({ stripeCustomerId: "cus_1" })
    await startCheckout(USER, SITE)
    expect(fakes.stripe.customers.create).not.toHaveBeenCalled()
    expect(fakes.stripe.checkout.sessions.create.mock.calls[0][0].customer).toBe("cus_1")
  })

  it("does not sell Full moon twice: an active plan skips Stripe entirely", async () => {
    giveProfile({ plan: "full-moon", stripeCustomerId: "cus_1" })
    expect(await startCheckout(USER, SITE)).toEqual({ kind: "already_subscribed" })
    expect(fakes.stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(fakes.stripe.customers.create).not.toHaveBeenCalled()
  })

  it("repairs the plan instead of charging again when Stripe has a live subscription the database missed", async () => {
    giveProfile({ stripeCustomerId: "cus_1" })
    fakes.stripe.subscriptions.list.mockResolvedValue({ data: [subscription({ status: "canceled", id: "sub_old" }), subscription()] })
    expect(await startCheckout(USER, SITE)).toEqual({ kind: "already_subscribed" })
    expect(fakes.stripe.checkout.sessions.create).not.toHaveBeenCalled()
    expect(fakes.profiles.get(USER.id)).toMatchObject({ plan: "full-moon", stripeSubscriptionId: "sub_1" })
  })

  it("fails before creating anything when the price is not configured", async () => {
    vi.stubEnv("STRIPE_PRICE_FULL_MOON", "")
    giveProfile()
    await expect(startCheckout(USER, SITE)).rejects.toThrow(/STRIPE_PRICE_FULL_MOON/)
    expect(fakes.stripe.customers.create).not.toHaveBeenCalled()
  })
})

describe("confirmCheckout", () => {
  beforeEach(() => giveProfile({ stripeCustomerId: "cus_1" }))

  it("sets Full moon and the renewal date for the user's own completed session", async () => {
    fakes.stripe.checkout.sessions.retrieve.mockResolvedValue(session())
    expect(await confirmCheckout(USER, SESSION_ID)).toBe("full_moon")
    expect(fakes.stripe.checkout.sessions.retrieve).toHaveBeenCalledWith(SESSION_ID, { expand: ["subscription"] })
    expect(fakes.profiles.get(USER.id)).toMatchObject({
      plan: "full-moon",
      stripeSubscriptionId: "sub_1",
      planRenewsAt: "2026-12-21T00:00:00.000Z",
    })
  })

  it("never asks Stripe about a malformed session id", async () => {
    for (const id of [null, "", "cs_test_short", "pi_123456789012345", "cs_test_abc/../../v1/customers", `cs_live_${"a".repeat(300)}`]) {
      expect(await confirmCheckout(USER, id)).toBe("not_found")
    }
    expect(fakes.stripe.checkout.sessions.retrieve).not.toHaveBeenCalled()
  })

  it("refuses someone else's session", async () => {
    fakes.stripe.checkout.sessions.retrieve.mockResolvedValue(session({ client_reference_id: "user-2" }))
    expect(await confirmCheckout(USER, SESSION_ID)).toBe("not_found")
    expect(fakes.writes).toHaveLength(0)
  })

  it("refuses a session for another Stripe customer", async () => {
    fakes.stripe.checkout.sessions.retrieve.mockResolvedValue(session({ customer: "cus_other" }))
    expect(await confirmCheckout(USER, SESSION_ID)).toBe("not_found")
    expect(fakes.writes).toHaveLength(0)
  })

  it("does nothing for a session that was not paid", async () => {
    fakes.stripe.checkout.sessions.retrieve.mockResolvedValue(session({ status: "open" }))
    expect(await confirmCheckout(USER, SESSION_ID)).toBe("not_found")
    fakes.stripe.checkout.sessions.retrieve.mockResolvedValue(session({ status: "expired" }))
    expect(await confirmCheckout(USER, SESSION_ID)).toBe("not_found")
    expect(fakes.writes).toHaveLength(0)
  })

  it("reports pending while a delayed payment leaves the subscription incomplete", async () => {
    fakes.stripe.checkout.sessions.retrieve.mockResolvedValue(
      session({ payment_status: "unpaid", subscription: subscription({ status: "incomplete" }) }),
    )
    expect(await confirmCheckout(USER, SESSION_ID)).toBe("pending")
    expect(fakes.profiles.get(USER.id)?.plan).toBe("free")
  })

  it("treats a session Stripe does not know as not found", async () => {
    fakes.stripe.checkout.sessions.retrieve.mockRejectedValue(Object.assign(new Error("No such session"), { code: "resource_missing" }))
    expect(await confirmCheckout(USER, SESSION_ID)).toBe("not_found")
  })

  it("lets other Stripe errors through, so the route can say the payment is still being confirmed", async () => {
    fakes.stripe.checkout.sessions.retrieve.mockRejectedValue(new Error("Stripe is down"))
    await expect(confirmCheckout(USER, SESSION_ID)).rejects.toThrow("Stripe is down")
  })
})

describe("handleStripeEvent", () => {
  beforeEach(() => giveProfile({ stripeCustomerId: "cus_1" }))

  it("applies the subscription's current state, not the snapshot in the event", async () => {
    // A late customer.subscription.updated says active, but the subscription
    // has since been canceled: the plan follows Stripe's current state.
    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription({ status: "canceled" }))
    const result = await handleStripeEvent(event("customer.subscription.updated", subscription({ status: "active" })))
    expect(fakes.stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_1")
    expect(result).toEqual({ outcome: "synced", userId: USER.id, plan: "free" })
    expect(fakes.profiles.get(USER.id)).toMatchObject({ plan: "free", planRenewsAt: null })
  })

  it("is idempotent: the same event twice leaves the same profile", async () => {
    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription())
    const created = event("customer.subscription.created", subscription())
    await handleStripeEvent(created)
    const once = { ...fakes.profiles.get(USER.id) }
    await handleStripeEvent(created)
    expect(fakes.profiles.get(USER.id)).toEqual(once)
    expect(once).toMatchObject({ plan: "full-moon", stripeSubscriptionId: "sub_1" })
  })

  it("keeps Full moon after a cancellation in the portal, then drops it when the subscription ends", async () => {
    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription({ cancel_at_period_end: true }))
    await handleStripeEvent(event("customer.subscription.updated", subscription()))
    expect(fakes.profiles.get(USER.id)).toMatchObject({ plan: "full-moon", planCancelAt: "2026-12-21T00:00:00.000Z" })

    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription({ status: "canceled", cancel_at_period_end: true }))
    await handleStripeEvent(event("customer.subscription.deleted", subscription()))
    expect(fakes.profiles.get(USER.id)).toMatchObject({ plan: "free", planCancelAt: null, planRenewsAt: null })
  })

  it("links a new customer through the checkout's client_reference_id", async () => {
    giveProfile() // no customer stored yet
    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription({ customer: "cus_9" }))
    const result = await handleStripeEvent(event("checkout.session.completed", session({ customer: "cus_9", subscription: "sub_1" })))
    expect(result).toMatchObject({ outcome: "synced", plan: "full-moon" })
    expect(fakes.profiles.get(USER.id)?.stripeCustomerId).toBe("cus_9")
  })

  it("never moves a customer that already belongs to another profile", async () => {
    giveProfile({ stripeCustomerId: "cus_1" })
    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription({ customer: "cus_9" }))
    const result = await handleStripeEvent(event("checkout.session.completed", session({ customer: "cus_9", subscription: "sub_1" })))
    expect(result.outcome).toBe("ignored")
    expect(fakes.writes).toHaveLength(0)
  })

  it("follows an invoice to its subscription", async () => {
    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription())
    await handleStripeEvent(event("invoice.paid", { id: "in_1", parent: { subscription_details: { subscription: "sub_1" } } }))
    expect(fakes.stripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_1")
    expect(fakes.profiles.get(USER.id)?.plan).toBe("full-moon")
  })

  it("ignores customers we do not know, events we do not handle and non-subscription checkouts", async () => {
    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription({ customer: "cus_unknown" }))
    expect((await handleStripeEvent(event("customer.subscription.updated", subscription()))).outcome).toBe("ignored")
    expect((await handleStripeEvent(event("charge.succeeded", {}))).outcome).toBe("ignored")
    expect((await handleStripeEvent(event("checkout.session.completed", session({ mode: "payment", subscription: null })))).outcome).toBe(
      "ignored",
    )
    expect((await handleStripeEvent(event("invoice.paid", { id: "in_1", parent: null }))).outcome).toBe("ignored")
    expect(fakes.writes).toHaveLength(0)
  })

  it("does not let the end of a second subscription downgrade a user whose current one is active", async () => {
    giveProfile({ stripeCustomerId: "cus_1", plan: "full-moon", stripeSubscriptionId: "sub_current" })
    fakes.stripe.subscriptions.retrieve.mockResolvedValue(subscription({ id: "sub_duplicate", status: "canceled" }))
    const result = await handleStripeEvent(event("customer.subscription.deleted", subscription({ id: "sub_duplicate" })))
    expect(result.outcome).toBe("ignored")
    expect(fakes.profiles.get(USER.id)?.plan).toBe("full-moon")
  })
})

describe("openPortal", () => {
  it("opens the portal for a Full moon subscriber, returning to the Plan tab", async () => {
    giveProfile({ plan: "full-moon", stripeCustomerId: "cus_1" })
    fakes.stripe.billingPortal.sessions.create.mockResolvedValue({ url: "https://billing.stripe.com/p/session/test" })
    expect(await openPortal(USER, SITE)).toBe("https://billing.stripe.com/p/session/test")
    expect(fakes.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://majnu.app/dashboard/plan",
    })
  })

  it("has nothing to open for a free user or a user without a customer", async () => {
    giveProfile({ stripeCustomerId: "cus_1" })
    expect(await openPortal(USER, SITE)).toBeNull()
    giveProfile({ plan: "full-moon" })
    expect(await openPortal(USER, SITE)).toBeNull()
    expect(fakes.stripe.billingPortal.sessions.create).not.toHaveBeenCalled()
  })
})
