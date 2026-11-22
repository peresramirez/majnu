// POST /api/credits/checkout and POST /api/credits/use: the request checks
// in front of lib/billing/credits.ts (stubbed here; its rules are tested in
// tests/unit/lib/billing/credits.test.ts). The owner always comes from the
// session, never from the body.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let user: { id: string; email?: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/credits", () => ({
  startCreditsCheckout: vi.fn(),
  claimDesignCredit: vi.fn(),
}))

import { POST as checkout } from "@/app/api/credits/checkout/route"
import { POST as use } from "@/app/api/credits/use/route"
import { claimDesignCredit, startCreditsCheckout } from "@/lib/billing/credits"

const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"

function post(handler: (r: Request) => Promise<Response>, path: string, body: unknown, headers: Record<string, string> = {}) {
  return handler(
    new Request(`https://majnu.app${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://majnu.app", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.unstubAllEnvs()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://majnu.app")
  vi.mocked(startCreditsCheckout).mockReset()
  vi.mocked(claimDesignCredit).mockReset()
  user = { id: "user-1", email: "anna@example.com", is_anonymous: false }
})

describe("POST /api/credits/checkout", () => {
  it("answers with Stripe's URL, for the session's user and the body's quantity only", async () => {
    vi.mocked(startCreditsCheckout).mockResolvedValue({ kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_x" })
    const res = await post(checkout, "/api/credits/checkout", { quantity: 2, owner: "someone-else", price: 1 })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_x" })
    expect(startCreditsCheckout).toHaveBeenCalledWith({ id: "user-1", email: "anna@example.com", isAnonymous: false }, { quantity: 2 }, "https://majnu.app")
  })

  it("maps refusals to status codes", async () => {
    vi.mocked(startCreditsCheckout).mockResolvedValueOnce({ kind: "refused", reason: "invalid_quantity", message: "Choose between 1 and 5" })
    expect((await post(checkout, "/api/credits/checkout", { quantity: 9 })).status).toBe(400)
    vi.mocked(startCreditsCheckout).mockResolvedValueOnce({ kind: "refused", reason: "account_required", message: "Create an account" })
    expect((await post(checkout, "/api/credits/checkout", { quantity: 1 })).status).toBe(403)
  })

  it("refuses signed-out, cross-site, non-JSON and malformed requests before Stripe", async () => {
    expect((await post(checkout, "/api/credits/checkout", { quantity: 1 }, { origin: "https://evil.example" })).status).toBe(403)
    expect((await post(checkout, "/api/credits/checkout", "quantity=1", { "content-type": "application/x-www-form-urlencoded" })).status).toBe(415)
    expect((await post(checkout, "/api/credits/checkout", "[1]")).status).toBe(400)
    user = null
    expect((await post(checkout, "/api/credits/checkout", { quantity: 1 })).status).toBe(401)
    expect(startCreditsCheckout).not.toHaveBeenCalled()
  })

  it("says nothing was charged when Stripe fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(startCreditsCheckout).mockRejectedValue(new Error("stripe down"))
    const res = await post(checkout, "/api/credits/checkout", { quantity: 1 })
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Nothing was charged/)
  })
})

describe("POST /api/credits/use", () => {
  const body = { letterId: LETTER, request: "A night sky", consent: true }

  it("answers with the purchase for the status card and the balance left", async () => {
    vi.mocked(claimDesignCredit).mockResolvedValue({
      kind: "claimed",
      balance: 1,
      letter: { slug: "abcdefghij", title: null },
      purchase: {
        id: "00000000-0000-4000-8000-000000000001",
        ownerId: "user-1",
        letterId: LETTER,
        status: "paid",
        request: "A night sky",
        consentAt: "2026-11-22T10:00:00.000Z",
        amountCents: 0,
        currency: "eur",
        couponId: null,
        freeDay: null,
        paidWithCredit: true,
        checkoutSessionId: null,
        paymentIntentId: null,
        refundId: null,
        receiptUrl: null,
        designId: null,
        paidAt: "2026-11-22T10:00:00.000Z",
        designStartedAt: null,
        finishedAt: null,
        refundedAt: null,
        createdAt: "2026-11-22T10:00:00.000Z",
      },
    })
    const res = await post(use, "/api/credits/use", { ...body, ownerId: "someone-else" })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.credits).toBe(1)
    expect(json.purchase).toMatchObject({ amount: "Used 1 personalisation", paidWithCredit: true, receiptUrl: null, giftUrl: "/l/abcdefghij" })
    expect(claimDesignCredit).toHaveBeenCalledWith({ id: "user-1" }, body)
  })

  it.each([
    ["consent_required", 400],
    ["invalid_request", 400],
    ["letter_not_found", 404],
    ["in_progress", 409],
    ["not_a_letter", 422],
    ["not_built", 422],
    ["none_left", 402],
  ] as const)("answers %s with %i", async (reason, status) => {
    vi.mocked(claimDesignCredit).mockResolvedValue({ kind: "refused", reason, message: "no", balance: reason === "none_left" ? 0 : null })
    const res = await post(use, "/api/credits/use", body)
    expect(res.status).toBe(status)
    expect((await res.json()).reason).toBe(reason)
  })

  it("refuses signed-out and cross-site requests", async () => {
    expect((await post(use, "/api/credits/use", body, { origin: "https://evil.example" })).status).toBe(403)
    user = null
    expect((await post(use, "/api/credits/use", body)).status).toBe(401)
    expect(claimDesignCredit).not.toHaveBeenCalled()
  })

  it("says the personalisation is still theirs when the design cannot be started", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(claimDesignCredit).mockRejectedValue(new Error("queue down"))
    const res = await post(use, "/api/credits/use", body)
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/still yours/)
  })
})
