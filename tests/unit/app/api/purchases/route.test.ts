// GET /api/purchases?letterId=: what the "Make it unique" button starts from,
// including a coupon code this browser remembered from a poster's short link.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let user: { id: string; is_anonymous?: boolean } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/billing/my-purchases", () => ({
  getMyLetterForWrapper: vi.fn(async (id: string) => ({ id, slug: "abcdefghij", kind: "letter", built: true })),
  getMyLatestPurchaseForLetter: vi.fn(async () => null),
}))

import { GET } from "@/app/api/purchases/route"

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
    expect(await res.json()).toEqual({ account: "guest", unavailable: null, purchase: null, rememberedCode: "LAYLA100" })
  })

  it("has none without the cookie, or with one that cannot be a code", async () => {
    expect((await (await get()).json()).rememberedCode).toBeNull()
    expect((await (await get("majnu_coupon=%3Cb%3E")).json()).rememberedCode).toBeNull()
  })

  it("still needs a session", async () => {
    user = null
    expect((await get("majnu_coupon=LAYLA100")).status).toBe(401)
  })
})
