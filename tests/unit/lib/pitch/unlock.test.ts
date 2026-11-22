// POST /pitch/unlock (app/(pitch)/pitch/unlock/route.ts): a wrong password is
// refused with nothing set; the right one sets the deck's cookie.
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { POST } from "@/app/(pitch)/pitch/unlock/route"
import { pitchCookieValue } from "@/lib/pitch/gate"

const URL = "https://majnu.app/pitch/unlock"

function form(password: string, accept?: string) {
  const body = new URLSearchParams({ password })
  return new Request(URL, {
    method: "POST",
    body,
    headers: { "content-type": "application/x-www-form-urlencoded", ...(accept ? { accept } : {}) },
  })
}

describe("POST /pitch/unlock from a plain form", () => {
  it("sends a wrong password back to the password screen, with no cookie", async () => {
    const res = await POST(form("layla.ai"))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/pitch?wrong=1")
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("cache-control")).toBe("no-store")
  })

  it("sets the cookie for the right password and opens the deck", async () => {
    const res = await POST(form("majnu.app"))
    expect(res.status).toBe(303)
    expect(res.headers.get("location")).toBe("/pitch")
    const cookie = res.headers.get("set-cookie") ?? ""
    expect(cookie).toContain(`majnu_pitch=${await pitchCookieValue()}`)
    expect(cookie).toContain("Path=/pitch")
    expect(cookie).toContain("Max-Age=2592000")
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).toMatch(/Secure/i)
    expect(cookie).toMatch(/SameSite=lax/i)
    expect(cookie).not.toContain("majnu.app")
  })
})

describe("POST /pitch/unlock from the password screen's script", () => {
  it("answers 401 { ok: false } for a wrong password", async () => {
    const res = await POST(form("wrong", "application/json"))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow")
  })

  it("answers { ok: true } with the cookie for the right one", async () => {
    const res = await POST(form("Majnu.app", "application/json"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(res.headers.get("set-cookie")).toContain(`majnu_pitch=${await pitchCookieValue()}`)
  })

  it("takes a JSON body too", async () => {
    const res = await POST(
      new Request(URL, {
        method: "POST",
        body: JSON.stringify({ password: "majnu.app" }),
        headers: { "content-type": "application/json", accept: "application/json" },
      }),
    )
    expect(res.status).toBe(200)
  })

  it("refuses a missing or malformed body without throwing", async () => {
    for (const body of ["", "{", JSON.stringify(["majnu.app"]), JSON.stringify({ password: 1 })]) {
      const res = await POST(
        new Request(URL, { method: "POST", body, headers: { "content-type": "application/json", accept: "application/json" } }),
      )
      expect(res.status, body).toBe(401)
    }
  })
})
