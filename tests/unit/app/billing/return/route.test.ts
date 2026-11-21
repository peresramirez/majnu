import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let user: { id: string; email?: string } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/service", () => ({ confirmCheckout: vi.fn() }))

import { GET } from "@/app/billing/return/route"
import { confirmCheckout } from "@/lib/billing/service"

const get = (query: string) => GET(new Request(`https://majnu.app/billing/return${query}`))

beforeEach(() => {
  vi.clearAllMocks()
  user = { id: "user-1" }
  vi.mocked(confirmCheckout).mockResolvedValue("full_moon")
})

describe("GET /billing/return", () => {
  it("confirms the session for the signed-in user and returns to the Plan tab", async () => {
    const res = await get("?session_id=cs_test_abcdefghijkl&plan=full-moon&user=user-2")
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://majnu.app/dashboard/plan")
    // Only the session id is passed on; the other parameters are ignored.
    expect(confirmCheckout).toHaveBeenCalledWith({ id: "user-1", email: undefined }, "cs_test_abcdefghijkl")
  })

  it("sends a signed-out visitor to sign-in and back to the same session", async () => {
    user = null
    const res = await get("?session_id=cs_test_abcdefghijkl")
    expect(res.headers.get("location")).toBe(
      `https://majnu.app/signin?next=${encodeURIComponent("/billing/return?session_id=cs_test_abcdefghijkl")}`,
    )
    expect(confirmCheckout).not.toHaveBeenCalled()
  })

  it("says the payment is being confirmed when it is not active yet, or Stripe cannot be reached", async () => {
    vi.mocked(confirmCheckout).mockResolvedValue("pending")
    expect((await get("?session_id=cs_test_abcdefghijkl")).headers.get("location")).toBe(
      "https://majnu.app/dashboard/plan?billing=pending",
    )

    vi.mocked(confirmCheckout).mockRejectedValue(new Error("Stripe is down"))
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect((await get("?session_id=cs_test_abcdefghijkl")).headers.get("location")).toBe(
      "https://majnu.app/dashboard/plan?billing=pending",
    )
    error.mockRestore()
  })

  it("returns quietly to the Plan tab for a session that is not this user's", async () => {
    vi.mocked(confirmCheckout).mockResolvedValue("not_found")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect((await get("?session_id=cs_test_abcdefghijkl")).headers.get("location")).toBe("https://majnu.app/dashboard/plan")
    warn.mockRestore()
  })
})
