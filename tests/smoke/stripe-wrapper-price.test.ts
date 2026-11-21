// The personalised wrapper's Stripe price matches lib/plans.ts: one-time,
// €2.99, VAT included, active. Read-only and free (one GET). Run with
// `npm run test:smoke`; skipped until STRIPE_PRICE_WRAPPER is set.
import Stripe from "stripe"
import { describe, expect, it } from "vitest"
import { wrapper } from "@/lib/plans"

const configured = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_WRAPPER)

describe.skipIf(!configured)("Stripe: the personalised wrapper's price", () => {
  it("is the one-time, VAT-inclusive price lib/plans.ts shows", async () => {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, { apiVersion: "2026-11-18.endive" })
    const price = await stripe.prices.retrieve(process.env.STRIPE_PRICE_WRAPPER as string)
    expect(price).toMatchObject({
      active: true,
      type: "one_time",
      unit_amount: wrapper.priceCents,
      currency: wrapper.currency,
      tax_behavior: "inclusive",
      recurring: null,
    })
    console.info(`The wrapper price is in ${price.livemode ? "LIVE" : "test"} mode`)
  })
})
