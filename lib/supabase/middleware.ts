// Refreshes the Supabase session on every matched request and guards the
// signed-in pages. This is the official @supabase/ssr middleware pattern: the
// client reads cookies from the request and writes refreshed ones to both the
// request (for Server Components rendering this request) and the response
// (for the browser). Returning any other response without those cookies signs
// people out at random, mid-chat.
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { nextPathFromSearch } from "@/lib/billing/next-path"

const PROTECTED_PREFIXES = ["/dashboard", "/create"]
const AUTH_PAGES = ["/signin", "/signup"]

function underPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

// Guests are Supabase anonymous users (the gift finder signs visitors in
// without asking, docs/plan.md "Gift finder"). Their `is_anonymous` flag comes
// from getUser(), which asks Supabase Auth, so it is current even right after
// an upgrade, when the old token still says anonymous.
type AuthUser = { id: string; is_anonymous?: boolean }

export function isGuest(user: AuthUser | null | undefined): boolean {
  return user?.is_anonymous === true
}

export type RouteAccess = "pass" | "sign_in" | "leave_auth_page"

// What the middleware does with one request:
// - signed-out visitors on /dashboard or /create go to /signin;
// - guests count as signed in there (they own the gifts they wrapped), and may
//   also open /signin and /signup, so they can turn the guest account into a
//   real one;
// - real users skip the sign-in pages.
// Everything else passes.
export function routeAccess(pathname: string, user: AuthUser | null): RouteAccess {
  if (!user && PROTECTED_PREFIXES.some((prefix) => underPrefix(pathname, prefix))) return "sign_in"
  if (user && !isGuest(user) && AUTH_PAGES.some((page) => underPrefix(pathname, page))) return "leave_auth_page"
  return "pass"
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  let cacheHeaders: Record<string, string> = {}

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      // Newer @supabase/ssr versions also pass headers that stop CDNs caching a
      // response that sets session cookies; 0.6 passes only the cookies.
      setAll(cookiesToSet, headers?: Record<string, string>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        if (headers) {
          cacheHeaders = headers
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
        }
      },
    },
  })

  // Nothing may run between creating the client and getUser(): getUser()
  // revalidates the token with Supabase Auth and triggers the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const access = routeAccess(request.nextUrl.pathname, user)

  if (access === "sign_in") {
    return redirectKeepingSession(request, "/signin", response, cacheHeaders)
  }

  // Real users skip the sign-in pages. The landing page stays open to them.
  // A same-site ?next=... or ?plan=full-moon on the sign-in page still decides
  // where they land, so "Choose Full moon" reaches the Plan tab either way.
  if (access === "leave_auth_page") {
    const next = nextPathFromSearch(request.nextUrl.searchParams) ?? "/dashboard"
    return redirectKeepingSession(request, next, response, cacheHeaders)
  }

  return response
}

// A redirect that carries the refreshed session cookies (and cache headers)
// from the response the Supabase client last built. `path` is a same-site path,
// optionally with a query; resolving it against this request's origin keeps
// the redirect on this site.
function redirectKeepingSession(request: NextRequest, path: string, from: NextResponse, cacheHeaders: Record<string, string>) {
  const url = new URL(path, request.nextUrl.origin)
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  Object.entries(cacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value))
  return redirect
}
