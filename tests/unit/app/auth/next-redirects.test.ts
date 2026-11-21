// The `next` destination through Google sign-in (server action → OAuth
// callback) and the middleware's redirect for signed-in users: same-site paths
// only, so none of them can be turned into an open redirect.
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const fakes = vi.hoisted(() => ({
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  middlewareUser: null as { id: string } | null,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithOAuth: fakes.signInWithOAuth, exchangeCodeForSession: fakes.exchangeCodeForSession },
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
  fakes.exchangeCodeForSession.mockResolvedValue({ data: {}, error: null })
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
})

describe("middleware redirect for signed-in users on the sign-in pages", () => {
  const visit = async (path: string) => (await updateSession(new NextRequest(`https://majnu.app${path}`))).headers.get("location")

  beforeEach(() => {
    fakes.middlewareUser = { id: "user-1" }
  })

  it("sends ?plan=full-moon to the Plan tab", async () => {
    expect(await visit("/signin?plan=full-moon")).toBe("https://majnu.app/dashboard/plan")
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
