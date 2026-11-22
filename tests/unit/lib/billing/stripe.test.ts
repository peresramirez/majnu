// Webhook signature verification, with real signatures computed locally by the
// Stripe SDK and checked with Web Crypto, as on Workers. No network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import Stripe from "stripe"
import { BillingConfigError, constructWebhookEvent, createStripeClient, wrapperPriceId } from "@/lib/billing/stripe"

const SECRET = "whsec_test_unit_secret"

const payload = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", object: "checkout.session" } },
})

function sign(body: string, options: { secret?: string; timestamp?: number } = {}) {
  return Stripe.webhooks.generateTestHeaderStringAsync({
    payload: body,
    secret: options.secret ?? SECRET,
    timestamp: options.timestamp,
    cryptoProvider: Stripe.createSubtleCryptoProvider(),
  })
}

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("constructWebhookEvent", () => {
  it("returns the event for a valid signature", async () => {
    const event = await constructWebhookEvent(payload, await sign(payload))
    expect(event.id).toBe("evt_1")
    expect(event.type).toBe("checkout.session.completed")
  })

  it("rejects a tampered body", async () => {
    const header = await sign(payload)
    await expect(constructWebhookEvent(payload.replace("cs_test_1", "cs_test_2"), header)).rejects.toThrow()
  })

  it("rejects a signature made with another secret", async () => {
    await expect(constructWebhookEvent(payload, await sign(payload, { secret: "whsec_other" }))).rejects.toThrow()
  })

  it("rejects a replayed signature older than the tolerance", async () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600
    await expect(constructWebhookEvent(payload, await sign(payload, { timestamp: tenMinutesAgo }))).rejects.toThrow()
  })

  it("rejects a header that is not a Stripe signature", async () => {
    await expect(constructWebhookEvent(payload, "t=1,v1=deadbeef")).rejects.toThrow()
    await expect(constructWebhookEvent(payload, "nonsense")).rejects.toThrow()
  })

  it("refuses to verify without a secret", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "")
    await expect(constructWebhookEvent(payload, await sign(payload))).rejects.toBeInstanceOf(BillingConfigError)
  })
})

describe("configuration", () => {
  it("needs the secret key and the price id from the environment", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "")
    vi.stubEnv("STRIPE_PRICE_WRAPPER", "")
    expect(() => createStripeClient()).toThrow(BillingConfigError)
    expect(() => wrapperPriceId()).toThrow(/STRIPE_PRICE_WRAPPER/)
    vi.stubEnv("STRIPE_PRICE_WRAPPER", "price_test_123")
    expect(wrapperPriceId()).toBe("price_test_123")
  })

  it("builds a client on the pinned API version without making a request", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_not_a_real_key")
    const fetchSpy = vi.spyOn(globalThis, "fetch")
    const client = createStripeClient()
    expect(client.getApiField("version")).toBe("2026-11-18.endive")
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
