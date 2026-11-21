import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let user: { id: string; email?: string } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/service", () => ({ startCheckout: vi.fn() }))

import { POST } from "@/app/api/checkout/route"
import { startCheckout } from "@/lib/billing/service"

function form(headers: Record<string, string> = {}) {
  return new Request("https://majnu.app/api/checkout", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://majnu.app", ...headers },
    body: "",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("MAJNU_BILLING", "on")
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://majnu.app")
  user = { id: "user-1", email: "anna@example.com" }
  vi.mocked(startCheckout).mockResolvedValue({ kind: "redirect", url: "https://checkout.stripe.com/c/pay/cs_test_1" })
})

describe("POST /api/checkout", () => {
  it("answers a form post with 303 to Stripe Checkout", async () => {
    const res = await POST(form())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://checkout.stripe.com/c/pay/cs_test_1")
    expect(startCheckout).toHaveBeenCalledWith({ id: "user-1", email: "anna@example.com" }, "https://majnu.app")
  })

  it("sends a signed-out form to sign-in, coming back to the Plan tab", async () => {
    user = null
    const res = await POST(form())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://majnu.app/signin?next=%2Fdashboard%2Fplan")
    expect(startCheckout).not.toHaveBeenCalled()
  })

  it("answers 401 to a signed-out request that is not a form", async () => {
    user = null
    const res = await POST(new Request("https://majnu.app/api/checkout", { method: "POST" }))
    expect(res.status).toBe(401)
  })

  it("refuses a post from another site", async () => {
    const res = await POST(form({ origin: "https://evil.example" }))
    expect(res.status).toBe(403)
    expect(startCheckout).not.toHaveBeenCalled()
  })

  it("starts nothing while billing is off", async () => {
    vi.stubEnv("MAJNU_BILLING", "")
    const res = await POST(form())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://majnu.app/dashboard/plan")
    expect(startCheckout).not.toHaveBeenCalled()
  })

  it("sends a Full moon user back to the Plan tab", async () => {
    vi.mocked(startCheckout).mockResolvedValue({ kind: "already_subscribed" })
    const res = await POST(form())
    expect(res.headers.get("location")).toBe("https://majnu.app/dashboard/plan")
  })

  it("shows an error on the Plan tab when Stripe fails", async () => {
    vi.mocked(startCheckout).mockRejectedValue(new Error("Stripe is down"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await POST(form())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://majnu.app/dashboard/plan?billing=error")
    error.mockRestore()
  })
})
