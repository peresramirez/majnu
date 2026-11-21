// The `next` destination through Google sign-in (server action → OAuth
// callback) and the middleware's redirect for signed-in users: same-site paths
// only, so none of them can be turned into an open redirect.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const fakes = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  linkIdentity: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  serverUser: null as { id: string; is_anonymous?: boolean } | null,
  middlewareUser: null as { id: string; is_anonymous?: boolean } | null,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: fakes.serverUser } }),
      signInWithOAuth: fakes.signInWithOAuth,
      linkIdentity: fakes.linkIdentity,
      exchangeCodeForSession: fakes.exchangeCodeForSession,
    },
  }),
}))
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url })
  },
}))
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: fakes.middlewareUser } }) } }),
}))

import { signInWithGoogle } from "@/app/auth/actions"
import { GET as callback } from "@/app/auth/callback/route"
import { updateSession } from "@/lib/supabase/middleware"

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://majnu.app")
  fakes.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.example/o/oauth2" }, error: null })
  fakes.linkIdentity.mockResolvedValue({ data: { url: "https://accounts.google.example/o/oauth2?link" }, error: null })
  fakes.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })
  fakes.serverUser = null
  fakes.middlewareUser = null
})

async function googleRedirectTo(next?: string | null): Promise<string> {
  await expect(signInWithGoogle(next)).rejects.toThrow("NEXT_REDIRECT")
  return fakes.signInWithOAuth.mock.calls[0][0].options.redirectTo
}

describe("signInWithGoogle", () => {
  it("carries a same-site next into the callback URL", async () => {
    expect(await googleRedirectTo("/dashboard/plan")).toBe("https://majnu.app/auth/callback?next=%2Fdashboard%2Fplan")
  })

  it("drops an unsafe next and keeps the plain callback", async () => {
    expect(await googleRedirectTo("//evil.example")).toBe("https://majnu.app/auth/callback")
    vi.clearAllMocks()
    fakes.signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.example/o/oauth2" }, error: null })
    expect(await googleRedirectTo("https://evil.example")).toBe("https://majnu.app/auth/callback")
  })

  it("keeps the plain callback without a next", async () => {
    expect(await googleRedirectTo()).toBe("https://majnu.app/auth/callback")
  })
})

describe("signInWithGoogle for a guest", () => {
  beforeEach(() => {
    fakes.serverUser = { id: "guest-1", is_anonymous: true }
  })

  it("links Google to the guest account instead of signing in, keeping next", async () => {
    await expect(signInWithGoogle("/dashboard/gifts")).rejects.toThrow("NEXT_REDIRECT")
    expect(fakes.signInWithOAuth).not.toHaveBeenCalled()
    expect(fakes.linkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://majnu.app/auth/callback?next=%2Fdashboard%2Fgifts" },
    })
  })

  it("signs in to the Google account's own account when the guest chooses to switch", async () => {
    await expect(signInWithGoogle(null, { switchAccount: true })).rejects.toThrow("NEXT_REDIRECT")
    expect(fakes.linkIdentity).not.toHaveBeenCalled()
    expect(fakes.signInWithOAuth).toHaveBeenCalledOnce()
  })

  it("returns a refused link as data, without redirecting", async () => {
    fakes.linkIdentity.mockResolvedValue({
      data: { url: null },
      error: { message: "Manual linking is disabled", code: "manual_linking_disabled" },
    })
    expect(await signInWithGoogle(null)).toEqual({
      error: { message: "Manual linking is disabled", code: "manual_linking_disabled" },
    })
  })

  it("signs real users in with Google as before", async () => {
    fakes.serverUser = { id: "user-1", is_anonymous: false }
    await expect(signInWithGoogle(null)).rejects.toThrow("NEXT_REDIRECT")
    expect(fakes.linkIdentity).not.toHaveBeenCalled()
    expect(fakes.signInWithOAuth).toHaveBeenCalledOnce()
  })
})

describe("GET /auth/callback", () => {
  const land = async (query: string) =>
    (await callback(new Request(`https://majnu.app/auth/callback${query}`))).headers.get("location")

  it("lands on next after exchanging the code", async () => {
    expect(await land("?code=abc&next=%2Fdashboard%2Fplan")).toBe("https://majnu.app/dashboard/plan")
    expect(fakes.exchangeCodeForSession).toHaveBeenCalledWith("abc")
  })

  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)"])(
    "lands on the dashboard instead of %s",
    async (next) => {
      expect(await land(`?code=abc&next=${encodeURIComponent(next)}`)).toBe("https://majnu.app/dashboard")
    },
  )

  it("lands on the dashboard without a next", async () => {
    expect(await land("?code=abc")).toBe("https://majnu.app/dashboard")
  })

  it("sends a refused Google link to sign-in with its code, keeping next", async () => {
    const query = "?next=%2Fdashboard%2Fplan&error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked"
    expect(await land(query)).toBe("https://majnu.app/signin?next=%2Fdashboard%2Fplan&auth_error=identity_already_exists")
    expect(fakes.exchangeCodeForSession).not.toHaveBeenCalled()
  })

  it("passes on only short snake_case error codes", async () => {
    expect(await land("?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E")).toBe("https://majnu.app/signin?auth_error=unknown")
    expect(await land("?error=access_denied")).toBe("https://majnu.app/signin?auth_error=access_denied")
  })

  it("sends a code that cannot be exchanged in this browser to sign-in", async () => {
    fakes.exchangeCodeForSession.mockResolvedValue({ data: {}, error: { message: "invalid request", code: "validation_failed" } })
    expect(await land("?code=abc")).toBe("https://majnu.app/signin?auth_error=exchange_failed")
  })
})

describe("middleware redirect for signed-in users on the sign-in pages", () => {
  const visit = async (path: string) => (await updateSession(new NextRequest(`https://majnu.app${path}`))).headers.get("location")

  beforeEach(() => {
    fakes.middlewareUser = { id: "user-1" }
  })

  it("sends an old ?plan=full-moon link to the Purchases tab", async () => {
    expect(await visit("/signin?plan=full-moon")).toBe("https://majnu.app/dashboard/purchases")
  })

  it("honours a same-site next, query included", async () => {
    expect(await visit("/signin?next=%2Fbilling%2Freturn%3Fsession_id%3Dcs_test_abcdefghijkl")).toBe(
      "https://majnu.app/billing/return?session_id=cs_test_abcdefghijkl",
    )
  })

  it("ignores an unsafe next", async () => {
    expect(await visit("/signin?next=%2F%2Fevil.example")).toBe("https://majnu.app/dashboard")
    expect(await visit("/signup?next=https%3A%2F%2Fevil.example")).toBe("https://majnu.app/dashboard")
  })

  it("still sends signed-out visitors of protected pages to sign-in", async () => {
    fakes.middlewareUser = null
    expect(await visit("/dashboard/plan")).toBe("https://majnu.app/signin")
  })
})
