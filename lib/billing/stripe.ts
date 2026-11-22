// The Stripe client and webhook verification, set up for Cloudflare Workers:
// requests go through fetch (not Node's http module) and webhook signatures
// are checked with the Web Crypto API (SubtleCrypto), which only has an async
// interface, hence constructEventAsync.
import "server-only"
import Stripe from "stripe"

export class BillingConfigError extends Error {
  constructor(name: string) {
    super(`${name} is not set`)
    this.name = "BillingConfigError"
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new BillingConfigError(name)
  return value
}

// A fresh client per call: on Workers, environment values are only guaranteed
// inside a request, and nothing request-scoped may live at module level.
// Creating one is cheap: it holds configuration, not a connection.
export function createStripeClient(): Stripe {
  return new Stripe(required("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-11-18.endive",
    httpClient: Stripe.createFetchHttpClient(),
    // Retries reuse an idempotency key the SDK adds, so they never double-create.
    maxNetworkRetries: 2,
    appInfo: { name: "majnu" },
  })
}

// The one-time price of a personalised wrapper (€2.99 including VAT,
// lib/plans.ts). Its id differs between test and live mode, so it always comes
// from the environment.
export function wrapperPriceId(): string {
  return required("STRIPE_PRICE_WRAPPER")
}

// Tags Checkout Sessions from this flow in the Stripe Dashboard. A fixed label
// with a random suffix, as Stripe recommends for integration_identifier.
export const CHECKOUT_INTEGRATION_ID = "majnu_wrapper_hxqmtrpa"
// The same for top-ups of personalisations bought in advance (./credits.ts).
export const CREDITS_INTEGRATION_ID = "majnu_credits_wkzfqbnd"

// Verifies the Stripe-Signature header against the raw body and returns the
// event. Throws Stripe's SignatureVerificationError when the signature is
// missing, wrong or older than the default five-minute tolerance.
export async function constructWebhookEvent(rawBody: string, signature: string): Promise<Stripe.Event> {
  return Stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    required("STRIPE_WEBHOOK_SECRET"),
    undefined,
    Stripe.createSubtleCryptoProvider(),
  )
}

export type { Stripe }
