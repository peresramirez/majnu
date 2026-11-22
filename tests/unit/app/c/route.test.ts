// GET /c/<code>, the short link behind a poster's QR code: it remembers the
// code in a cookie and lands on the home page, for visitors with no session,
// without asking the database and without showing the code.
import { describe, expect, it, vi } from "vitest"

// The route must not need a session or the database: if it reached either,
// these would throw.
vi.mock("@/lib/supabase/server", () => ({ createClient: () => { throw new Error("no session lookup on /c/") } }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("no database on /c/") } }))

import { GET } from "@/app/c/[code]/route"
import { COUPON_COOKIE_MAX_AGE } from "@/lib/billing/coupon-cookie"

function open(code: string) {
  return GET(new Request(`https://majnu.app/c/${code}`), { params: Promise.resolve({ code }) })
}

describe("GET /c/<code>", () => {
  it("remembers the code for 30 days in a Secure, HttpOnly, SameSite=Lax cookie and lands on /", async () => {
    const res = await open("LAYLA100")
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://majnu.app/")
    const cookie = res.headers.get("set-cookie") ?? ""
    expect(cookie).toMatch(/^majnu_coupon=LAYLA100;/)
    expect(cookie).toContain(`Max-Age=${COUPON_COOKIE_MAX_AGE}`)
    expect(COUPON_COOKIE_MAX_AGE).toBe(30 * 24 * 60 * 60)
    for (const attribute of ["Path=/", "HttpOnly", "Secure", "SameSite=Lax"]) expect(cookie).toContain(attribute)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(res.headers.get("x-robots-tag")).toBe("noindex")
  })

  it("never shows the code in the response", async () => {
    const res = await open("LAYLA100")
    expect(await res.text()).toBe("")
    expect(res.headers.get("location")).not.toMatch(/LAYLA/i)
  })

  it("normalises the code as the dialog would", async () => {
    expect((await open("layla-100")).headers.get("set-cookie")).toMatch(/^majnu_coupon=LAYLA100;/)
    expect((await open("layla%20100")).headers.get("set-cookie")).toMatch(/^majnu_coupon=LAYLA100;/)
    expect((await open("k7qm-3xra-pd9c-whte")).headers.get("set-cookie")).toMatch(/^majnu_coupon=K7QM3XRAPD9CWHTE;/)
  })

  it.each(["abc", "LAYLA!00", "%E0%A4%A", "x".repeat(40), "<script>"])("lands on / with nothing remembered for %s", async (code) => {
    const res = await open(code)
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("https://majnu.app/")
    expect(res.headers.get("set-cookie")).toMatch(/^majnu_coupon=; Max-Age=0;/)
    expect(await res.text()).toBe("")
  })
})
