// The webhook with real signature checks (signed locally by the Stripe SDK)
// and the event handling replaced by a fake.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/billing/service", () => ({ handleStripeEvent: vi.fn() }))

import Stripe from "stripe"
import { POST } from "@/app/api/stripe/webhook/route"
import { handleStripeEvent } from "@/lib/billing/service"

const SECRET = "whsec_test_route_secret"
const body = JSON.stringify({
  id: "evt_1",
  object: "event",
  type: "checkout.session.completed",
  data: { object: { id: "cs_test_1", object: "checkout.session", mode: "payment", metadata: { purchase_id: "p1" } } },
})

const sign = (payload: string, secret = SECRET) =>
  Stripe.webhooks.generateTestHeaderStringAsync({ payload, secret, cryptoProvider: Stripe.createSubtleCryptoProvider() })

function post(payload: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (signature) headers["stripe-signature"] = signature
  return POST(new Request("https://majnu.app/api/stripe/webhook", { method: "POST", headers, body: payload }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", SECRET)
  vi.mocked(handleStripeEvent).mockResolvedValue({ outcome: "applied", status: "paid" })
})

afterEach(() => vi.unstubAllEnvs())

describe("POST /api/stripe/webhook", () => {
  it("handles a correctly signed event", async () => {
    const res = await post(body, await sign(body))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ received: true, outcome: "applied" })
    expect(vi.mocked(handleStripeEvent).mock.calls[0][0]).toMatchObject({ id: "evt_1", type: "checkout.session.completed" })
  })

  it("answers 400 without a signature", async () => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect(handleStripeEvent).not.toHaveBeenCalled()
  })

  it("answers 400 to a bad signature, a wrong secret or a tampered body", async () => {
    expect((await post(body, "t=1,v1=deadbeef")).status).toBe(400)
    expect((await post(body, await sign(body, "whsec_someone_else"))).status).toBe(400)
    const tampered = body.replace("checkout.session.completed", "checkout.session.expired")
    expect((await post(tampered, await sign(body))).status).toBe(400)
    expect(handleStripeEvent).not.toHaveBeenCalled()
  })

  it("answers 500 when processing fails, so Stripe retries", async () => {
    vi.mocked(handleStripeEvent).mockRejectedValue(new Error("database down"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await post(body, await sign(body))).status).toBe(500)
    error.mockRestore()
  })

  it("answers 500 and handles nothing when the secret is not configured", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "")
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await post(body, "t=1,v1=deadbeef")).status).toBe(500)
    expect(handleStripeEvent).not.toHaveBeenCalled()
    error.mockRestore()
  })

  it("refuses an oversized body", async () => {
    const huge = "x".repeat(600 * 1024)
    expect((await post(huge, "t=1,v1=deadbeef")).status).toBe(413)
  })
})
