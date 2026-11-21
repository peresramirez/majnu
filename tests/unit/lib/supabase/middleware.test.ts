// Who may open which page: signed-out visitors, guests (Supabase anonymous
// users from the gift finder) and real users, on every kind of route.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const fakes = vi.hoisted(() => ({ user: null as { id: string; is_anonymous?: boolean } | null }))
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: fakes.user } }) } }),
}))

import { isGuest, routeAccess, updateSession } from "@/lib/supabase/middleware"

const nobody = null
const guest = { id: "guest-1", is_anonymous: true }
const member = { id: "user-1", is_anonymous: false }
// Users created before anonymous sign-ins existed may carry no flag at all.
const legacyMember = { id: "user-2" }

describe("isGuest", () => {
  it("is true only for anonymous users", () => {
    expect(isGuest(guest)).toBe(true)
    expect(isGuest(member)).toBe(false)
    expect(isGuest(legacyMember)).toBe(false)
    expect(isGuest(null)).toBe(false)
  })
})

describe("routeAccess", () => {
  it.each([
    // path, signed out, guest, real user
    ["/dashboard", "sign_in", "pass", "pass"],
    ["/dashboard/find", "sign_in", "pass", "pass"],
    ["/dashboard/gifts", "sign_in", "pass", "pass"],
    ["/dashboard/plan", "sign_in", "pass", "pass"],
    ["/create/0b6f2a4c-1d3e-4f5a-8b9c-0d1e2f3a4b5c", "sign_in", "pass", "pass"],
    ["/signin", "pass", "pass", "leave_auth_page"],
    ["/signup", "pass", "pass", "leave_auth_page"],
    ["/", "pass", "pass", "pass"],
    ["/privacy", "pass", "pass", "pass"],
    ["/terms", "pass", "pass", "pass"],
    // Lookalike paths are not the protected or sign-in pages.
    ["/dashboarding", "pass", "pass", "pass"],
    ["/signing", "pass", "pass", "pass"],
  ] as const)("%s: signed out → %s, guest → %s, real user → %s", (path, signedOut, asGuest, asMember) => {
    expect(routeAccess(path, nobody)).toBe(signedOut)
    expect(routeAccess(path, guest)).toBe(asGuest)
    expect(routeAccess(path, member)).toBe(asMember)
    expect(routeAccess(path, legacyMember)).toBe(asMember)
  })
})

describe("updateSession", () => {
  const visit = async (path: string) => {
    const response = await updateSession(new NextRequest(`https://majnu.app${path}`))
    return response.headers.get("location")
  }

  beforeEach(() => {
    fakes.user = null
  })

  it("lets a guest open the app and both sign-in pages", async () => {
    fakes.user = guest
    for (const path of ["/dashboard", "/dashboard/find", "/create/abc", "/signin", "/signup", "/signup?plan=full-moon"]) {
      expect(await visit(path), path).toBeNull()
    }
  })

  it("sends real users from the sign-in pages to the dashboard or their next", async () => {
    fakes.user = member
    expect(await visit("/signup")).toBe("https://majnu.app/dashboard")
    expect(await visit("/signin?next=%2Fdashboard%2Ffind")).toBe("https://majnu.app/dashboard/find")
  })

  it("sends signed-out visitors of the app to sign-in", async () => {
    expect(await visit("/dashboard/find")).toBe("https://majnu.app/signin")
    expect(await visit("/create/abc")).toBe("https://majnu.app/signin")
    expect(await visit("/signup")).toBeNull()
  })
})
