import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let user: { id: string; email?: string } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/service", () => ({ openPortal: vi.fn() }))

import { POST } from "@/app/api/billing/portal/route"
import { openPortal } from "@/lib/billing/service"

function form(origin = "https://majnu.app") {
  return new Request("https://majnu.app/api/billing/portal", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin },
    body: "",
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://majnu.app")
  user = { id: "user-1" }
  vi.mocked(openPortal).mockResolvedValue("https://billing.stripe.com/p/session/test_1")
})

describe("POST /api/billing/portal", () => {
  it("sends a Full moon subscriber to the Stripe customer portal with 303", async () => {
    const res = await POST(form())
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://billing.stripe.com/p/session/test_1")
  })

  it("works with billing switched off, so whoever pays can always cancel", async () => {
    vi.stubEnv("MAJNU_BILLING", "")
    expect((await POST(form())).headers.get("location")).toBe("https://billing.stripe.com/p/session/test_1")
  })

  it("sends a user with nothing to manage back to the Plan tab", async () => {
    vi.mocked(openPortal).mockResolvedValue(null)
    expect((await POST(form())).headers.get("location")).toBe("https://majnu.app/dashboard/plan")
  })

  it("answers 401 signed out, and refuses another site's post", async () => {
    user = null
    expect((await POST(new Request("https://majnu.app/api/billing/portal", { method: "POST" }))).status).toBe(401)
    user = { id: "user-1" }
    expect((await POST(form("https://evil.example"))).status).toBe(403)
    expect(openPortal).not.toHaveBeenCalled()
  })

  it("shows an error on the Plan tab when Stripe fails", async () => {
    vi.mocked(openPortal).mockRejectedValue(new Error("no portal configuration"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await POST(form())).headers.get("location")).toBe("https://majnu.app/dashboard/plan?billing=error")
    error.mockRestore()
  })
})
