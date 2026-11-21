// POST /api/checkout with the checkout service replaced by a fake: what the
// route accepts, what it passes on, and how each refusal is answered.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let user: { id: string; email?: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/service", () => ({ startWrapperCheckout: vi.fn() }))

import { POST } from "@/app/api/checkout/route"
import { startWrapperCheckout } from "@/lib/billing/service"

const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"
const BODY = { letterId: LETTER, request: "A 1950s cinema ticket by the sea", consent: true, returnTo: `/create/${LETTER}` }

function post(body: unknown = BODY, headers: Record<string, string> = {}) {
  return POST(
    new Request("https://majnu.app/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://majnu.app", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://majnu.app")
  user = { id: "user-1", email: "anna@example.com", is_anonymous: false }
  vi.mocked(startWrapperCheckout).mockResolvedValue({ kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_1", purchaseId: "p1" })
})

describe("POST /api/checkout", () => {
  it("answers with the Checkout URL and passes the user, the body and the site origin on", async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1" })
    expect(startWrapperCheckout).toHaveBeenCalledWith(
      { id: "user-1", email: "anna@example.com", isAnonymous: false },
      { letterId: LETTER, request: BODY.request, consent: true, returnTo: BODY.returnTo },
      "https://majnu.app",
    )
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("tells the service when the user is a guest", async () => {
    user = { id: "guest-1", is_anonymous: true }
    vi.mocked(startWrapperCheckout).mockResolvedValue({ kind: "refused", reason: "account_required", message: "Create a free account first." })
    const res = await post()
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ reason: "account_required" })
    expect(vi.mocked(startWrapperCheckout).mock.calls[0][0]).toMatchObject({ isAnonymous: true })
  })

  it.each([
    ["consent_required", 400],
    ["invalid_request", 400],
    ["letter_not_found", 404],
    ["in_progress", 409],
    ["not_a_letter", 422],
    ["not_built", 422],
  ] as const)("answers a %s refusal with %i and the message", async (reason, status) => {
    vi.mocked(startWrapperCheckout).mockResolvedValue({ kind: "refused", reason, message: "why" })
    const res = await post()
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: "why", reason })
  })

  it("answers 401 without a session, before reading the body", async () => {
    user = null
    const res = await post()
    expect(res.status).toBe(401)
    expect(startWrapperCheckout).not.toHaveBeenCalled()
  })

  it("refuses a cross-site post", async () => {
    const res = await post(BODY, { origin: "https://evil.example" })
    expect(res.status).toBe(403)
    expect(startWrapperCheckout).not.toHaveBeenCalled()
  })

  it("refuses anything but JSON, so a plain cross-site form cannot start a purchase", async () => {
    const res = await post("letterId=x", { "content-type": "application/x-www-form-urlencoded" })
    expect(res.status).toBe(415)
    expect(startWrapperCheckout).not.toHaveBeenCalled()
  })

  it("answers 400 to a body that is not a JSON object", async () => {
    expect((await post("not json")).status).toBe(400)
    expect((await post("[1,2]")).status).toBe(400)
    expect(startWrapperCheckout).not.toHaveBeenCalled()
  })

  it("answers 502 and charges nothing when Stripe fails", async () => {
    vi.mocked(startWrapperCheckout).mockRejectedValue(new Error("Stripe is down"))
    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Nothing was charged/)
  })
})
