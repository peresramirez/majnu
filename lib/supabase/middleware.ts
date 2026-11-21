// Refreshes the Supabase session on every matched request and guards the
// signed-in pages. This is the official @supabase/ssr middleware pattern: the
// client reads cookies from the request and writes refreshed ones to both the
// request (for Server Components rendering this request) and the response
// (for the browser). Returning any other response without those cookies signs
// people out at random, mid-chat.
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

const PROTECTED_PREFIXES = ["/dashboard", "/create"]
const AUTH_PAGES = ["/signin", "/signup"]

function underPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
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

  const { pathname } = request.nextUrl

  if (!user && PROTECTED_PREFIXES.some((prefix) => underPrefix(pathname, prefix))) {
    return redirectKeepingSession(request, "/signin", response, cacheHeaders)
  }

  // Signed-in users skip the sign-in pages. The landing page stays open to them.
  if (user && AUTH_PAGES.some((page) => underPrefix(pathname, page))) {
    return redirectKeepingSession(request, "/dashboard", response, cacheHeaders)
  }

  return response
}

// A redirect that carries the refreshed session cookies (and cache headers)
// from the response the Supabase client last built.
function redirectKeepingSession(request: NextRequest, pathname: string, from: NextResponse, cacheHeaders: Record<string, string>) {
  const url = request.nextUrl.clone()
  url.pathname = pathname
  url.search = ""
  const redirect = NextResponse.redirect(url)
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  Object.entries(cacheHeaders).forEach(([key, value]) => redirect.headers.set(key, value))
  return redirect
}
