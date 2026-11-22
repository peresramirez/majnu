// GET /billing/return with the confirmation replaced by a fake: where the
// sender lands after Checkout.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let user: { id: string } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/service", () => ({ confirmCheckout: vi.fn() }))

import { GET } from "@/app/billing/return/route"
import { confirmCheckout } from "@/lib/billing/service"

const PURCHASE = "7c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f"
const get = (query = "?session_id=cs_test_abcdefghijkl") => GET(new Request(`https://majnu.app/billing/return${query}`))

beforeEach(() => {
  vi.clearAllMocks()
  user = { id: "user-1" }
  vi.mocked(confirmCheckout).mockResolvedValue({ outcome: "paid", purchaseId: PURCHASE })
})

describe("GET /billing/return", () => {
  it("confirms the session for the signed-in user and shows that purchase's status", async () => {
    const res = await get()
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe(`https://majnu.app/dashboard/purchases?purchase=${PURCHASE}`)
    expect(confirmCheckout).toHaveBeenCalledWith({ id: "user-1" }, "cs_test_abcdefghijkl")
  })

  it("says the payment is being confirmed for a delayed payment method", async () => {
    vi.mocked(confirmCheckout).mockResolvedValue({ outcome: "processing", purchaseId: PURCHASE })
    expect((await get()).headers.get("location")).toBe(`https://majnu.app/dashboard/purchases?purchase=${PURCHASE}&billing=processing`)
  })

  it("goes to the Purchases tab for a session that is not this user's", async () => {
    vi.mocked(confirmCheckout).mockResolvedValue({ outcome: "not_found" })
    expect((await get()).headers.get("location")).toBe("https://majnu.app/dashboard/purchases")
  })

  it("still lands on the Purchases tab when Stripe fails; the webhook marks it paid", async () => {
    vi.mocked(confirmCheckout).mockRejectedValue(new Error("Stripe is down"))
    expect((await get()).headers.get("location")).toBe("https://majnu.app/dashboard/purchases?billing=processing")
  })

  it("sends a signed-out visitor to sign in and back to the same return URL", async () => {
    user = null
    const res = await get()
    expect(res.headers.get("location")).toBe(
      `https://majnu.app/signin?next=${encodeURIComponent("/billing/return?session_id=cs_test_abcdefghijkl")}`,
    )
    expect(confirmCheckout).not.toHaveBeenCalled()
  })
})
