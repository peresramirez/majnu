// GET /api/purchases?letterId=: what the "Make it unique" button starts from,
// including a coupon code this browser remembered from a poster's short link.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let user: { id: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/free-designs", () => ({ freeDesignsLeft: vi.fn(async () => ({ left: 2, perDay: 3 })) }))
vi.mock("@/lib/billing/credits", () => ({ designCreditsBalance: vi.fn(async () => 2) }))
vi.mock("@/lib/billing/my-purchases", () => ({
  getMyLetterForWrapper: vi.fn(async (id: string) => ({ id, slug: "abcdefghij", kind: "letter", built: true })),
  getMyLatestPurchaseForLetter: vi.fn(async () => null),
}))

import { GET } from "@/app/api/purchases/route"
import { designCreditsBalance } from "@/lib/billing/credits"
import { freeDesignsLeft } from "@/lib/billing/free-designs"

const LETTER = "0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c"
const get = (cookie?: string) =>
  GET(new Request(`https://majnu.app/api/purchases?letterId=${LETTER}`, { headers: cookie ? { cookie } : {} }))

beforeEach(() => {
  user = { id: "guest-1", is_anonymous: true }
})

describe("GET /api/purchases", () => {
  it("hands the remembered code to the dialog of the same browser", async () => {
    const res = await get("sb-x-auth-token=abc; majnu_coupon=LAYLA100")
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ account: "guest", unavailable: null, purchase: null, rememberedCode: "LAYLA100", freeDesigns: { left: 2, perDay: 3 }, credits: null })
  })

  it("has none without the cookie, or with one that cannot be a code", async () => {
    expect((await (await get()).json()).rememberedCode).toBeNull()
    expect((await (await get("majnu_coupon=%3Cb%3E")).json()).rememberedCode).toBeNull()
  })

  it("says how many free designs this connection has left today, from the request's headers", async () => {
    const res = await get()
    expect((await res.json()).freeDesigns).toEqual({ left: 2, perDay: 3 })
    expect(vi.mocked(freeDesignsLeft).mock.calls[0][0]).toBeInstanceOf(Headers)
  })

  it("still shows the button when free designs cannot be counted: freeDesigns is null", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(freeDesignsLeft).mockRejectedValueOnce(new Error("database down"))
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).freeDesigns).toBeNull()
  })

  it("tells a member how many personalisations they bought in advance and have left", async () => {
    user = { id: "user-1", is_anonymous: false }
    const body = await (await get()).json()
    expect(body.account).toBe("member")
    expect(body.credits).toBe(2)
    expect(vi.mocked(designCreditsBalance)).toHaveBeenCalledWith("user-1")
  })

  it("never asks the balance for a guest, and shows the button when the balance cannot be read", async () => {
    vi.mocked(designCreditsBalance).mockClear()
    expect((await (await get()).json()).credits).toBeNull()
    expect(vi.mocked(designCreditsBalance)).not.toHaveBeenCalled()
    user = { id: "user-1", is_anonymous: false }
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.mocked(designCreditsBalance).mockRejectedValueOnce(new Error("database down"))
    const res = await get()
    expect(res.status).toBe(200)
    expect((await res.json()).credits).toBeNull()
  })

  it("still needs a session", async () => {
    user = null
    expect((await get("majnu_coupon=LAYLA100")).status).toBe(401)
  })
})
