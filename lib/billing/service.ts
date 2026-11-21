// The Full moon subscription: starting Checkout, confirming it on return,
// opening the customer portal, and keeping profiles in step with Stripe.
//
// How the plan stays correct (docs/plan.md, "Billing"):
// * The return page sets the plan straight away, so the upgrade shows at once.
// * The webhook is the source of truth for everything after that (renewals,
//   failed payments, cancellations). Stripe may deliver events late, twice or
//   out of order, so a handler never trusts the snapshot in the event: it
//   retrieves the subscription and writes its current state. Replaying any
//   event therefore leaves the same result (idempotent), and an old event
//   cannot undo a newer change.
// * Each event is matched to a user through Stripe's object graph
//   (subscription → customer → profiles.stripe_customer_id), not metadata.
import "server-only"
import type Stripe from "stripe"
import { getBillingProfile, getBillingProfileByCustomer, saveCustomerId, savePlanState, type BillingProfile } from "./profiles"
import { CHECKOUT_INTEGRATION_ID, createStripeClient, fullMoonPriceId } from "./stripe"
import { customerIdOf, isActiveStatus, planStateOf, type PlanState } from "./subscription"

export type BillingUser = { id: string; email?: string | null }

// ---------- Checkout ----------

export type CheckoutStart = { kind: "redirect"; url: string } | { kind: "already_subscribed" }

export async function startCheckout(user: BillingUser, siteUrl: string): Promise<CheckoutStart> {
  const profile = await getBillingProfile(user.id)
  if (profile?.plan === "full-moon") return { kind: "already_subscribed" }

  const priceId = fullMoonPriceId()
  const stripe = createStripeClient()

  let customerId = profile?.stripeCustomerId ?? null
  if (customerId) {
    // A subscription that is live in Stripe but not yet in our database (a
    // missed webhook, a tab closed before the return page) must not be paid twice.
    const live = await findLiveSubscription(stripe, customerId)
    if (live) {
      await applySubscription(user.id, live, profile)
      return { kind: "already_subscribed" }
    }
  } else {
    // The idempotency key makes a double click (or two tabs) get one customer.
    const customer = await stripe.customers.create(
      { email: user.email ?? undefined, metadata: { user_id: user.id } },
      { idempotencyKey: `majnu-customer-${user.id}` },
    )
    customerId = await saveCustomerId(user.id, customer.id)
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceId, quantity: 1 }],
    // No payment_method_types: Stripe shows the methods enabled in the Dashboard.
    success_url: `${siteUrl}/billing/return?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/dashboard/plan`,
    subscription_data: { metadata: { user_id: user.id } },
    integration_identifier: CHECKOUT_INTEGRATION_ID,
  })
  if (!session.url) throw new Error("Stripe returned a Checkout Session without a URL")
  return { kind: "redirect", url: session.url }
}

async function findLiveSubscription(stripe: Stripe, customerId: string): Promise<Stripe.Subscription | null> {
  const { data } = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 })
  return data.find((subscription) => isActiveStatus(subscription.status)) ?? null
}

// ---------- Return from Checkout ----------

export type ReturnOutcome = "full_moon" | "pending" | "not_found"

const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]{10,250}$/

// Confirms a finished Checkout Session for the signed-in user. Only the session
// id comes from the URL; everything else is read back from Stripe, and the
// session must have been created for this user (client_reference_id) and,
// if the profile already has a customer, for that customer.
export async function confirmCheckout(user: BillingUser, sessionId: string | null): Promise<ReturnOutcome> {
  if (!sessionId || !SESSION_ID.test(sessionId)) return "not_found"

  const stripe = createStripeClient()
  let session: Stripe.Checkout.Session
  try {
    session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["subscription"] })
  } catch (error) {
    if (isMissingResource(error)) return "not_found"
    throw error
  }

  if (session.client_reference_id !== user.id || session.mode !== "subscription") return "not_found"
  const customerId = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? null)
  if (!customerId) return "not_found"

  let profile = await getBillingProfile(user.id)
  if (profile?.stripeCustomerId && profile.stripeCustomerId !== customerId) return "not_found"
  // An open or expired session was never paid. A complete one can still be
  // waiting on a delayed payment method; its subscription then is not active
  // yet, and the webhook switches the plan on once the payment succeeds.
  if (session.status !== "complete") return "not_found"

  if (!profile?.stripeCustomerId) {
    await saveCustomerId(user.id, customerId)
    profile = await getBillingProfile(user.id)
  }

  const subscription =
    typeof session.subscription === "string"
      ? await stripe.subscriptions.retrieve(session.subscription)
      : session.subscription
  if (!subscription) return "pending"

  const state = await applySubscription(user.id, subscription, profile)
  return state?.plan === "full-moon" ? "full_moon" : "pending"
}

function isMissingResource(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "resource_missing"
  )
}

// ---------- Customer portal ----------

// A portal session where a Full moon subscriber can cancel (at the end of the
// paid period, set in the portal configuration), resume or change their card.
// Null when the user has nothing to manage.
export async function openPortal(user: BillingUser, siteUrl: string): Promise<string | null> {
  const profile = await getBillingProfile(user.id)
  if (!profile?.stripeCustomerId || profile.plan !== "full-moon") return null
  const session = await createStripeClient().billingPortal.sessions.create({
    customer: profile.stripeCustomerId,
    return_url: `${siteUrl}/dashboard/plan`,
  })
  return session.url
}

// ---------- Webhook ----------

export type SyncOutcome =
  | { outcome: "synced"; userId: string; plan: PlanState["plan"] }
  | { outcome: "ignored"; reason: string }

// The events the webhook endpoint subscribes to in the Stripe Dashboard.
export const HANDLED_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
] as const

export async function handleStripeEvent(event: Stripe.Event): Promise<SyncOutcome> {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object
      if (session.mode !== "subscription" || !session.subscription) return ignored("not a subscription checkout")
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id
      return syncSubscription(subscriptionId, session.client_reference_id)
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed":
      return syncSubscription(event.data.object.id)
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscription = event.data.object.parent?.subscription_details?.subscription
      if (!subscription) return ignored("invoice without a subscription")
      return syncSubscription(typeof subscription === "string" ? subscription : subscription.id)
    }
    default:
      return ignored(`unhandled event type ${event.type}`)
  }
}

// Brings one user's plan in line with the subscription's current state in
// Stripe. `userIdHint` is the Checkout Session's client_reference_id (set by
// our server), used only when the customer is not yet linked to a profile.
export async function syncSubscription(subscriptionId: string, userIdHint?: string | null): Promise<SyncOutcome> {
  const stripe = createStripeClient()
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const customerId = customerIdOf(subscription)

  let profile = await getBillingProfileByCustomer(customerId)
  if (!profile && userIdHint) {
    const candidate = await getBillingProfile(userIdHint)
    if (candidate && !candidate.stripeCustomerId) {
      await saveCustomerId(userIdHint, customerId)
      profile = { ...candidate, stripeCustomerId: customerId }
    }
  }
  if (!profile) return ignored("customer not linked to a profile")

  const state = await applySubscription(profile.userId, subscription, profile)
  return state ? { outcome: "synced", userId: profile.userId, plan: state.plan } : ignored("another subscription is current")
}

// Writes the plan a subscription implies. A customer can end up with two
// subscriptions (two Checkout tabs paid at once); the one on file governs, so
// the end of the other one never downgrades a Full moon user.
async function applySubscription(
  userId: string,
  subscription: Stripe.Subscription,
  profile: BillingProfile | null,
): Promise<PlanState | null> {
  const state = planStateOf(subscription)
  const otherIsCurrent =
    profile?.plan === "full-moon" && profile.stripeSubscriptionId !== null && profile.stripeSubscriptionId !== subscription.id
  if (state.plan === "free" && otherIsCurrent) return null
  await savePlanState(userId, state)
  return state
}

function ignored(reason: string): SyncOutcome {
  return { outcome: "ignored", reason }
}
