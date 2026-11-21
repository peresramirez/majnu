// Small request helpers shared by the billing routes. Route files may only
// export their handlers, so these live here.
import "server-only"

const NO_STORE = { "Cache-Control": "no-store" }

// The public origin for URLs we hand to Stripe (success, cancel and return
// URLs): NEXT_PUBLIC_SITE_URL, falling back to the request's own origin.
export function siteOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "")
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      // Fall through to the request origin.
    }
  }
  return new URL(request.url).origin
}

// Defence in depth against cross-site form posts. Session cookies are
// SameSite=Lax, so another site's POST already arrives signed out; this also
// refuses a POST whose Origin header names another site. A missing Origin
// (curl, some older browsers) is allowed: it cannot carry a session cookie
// from another site either.
export function isSameOriginPost(request: Request): boolean {
  const origin = request.headers.get("origin")
  if (!origin) return true
  return origin === new URL(request.url).origin || origin === siteOrigin(request)
}

// A plain HTML form submission, as opposed to fetch() or curl.
export function isFormPost(request: Request): boolean {
  const type = request.headers.get("content-type") ?? ""
  return type.startsWith("application/x-www-form-urlencoded") || type.startsWith("multipart/form-data")
}

// 303 See Other: after a POST, the browser follows with a GET. A path is
// resolved against the request's own origin; Stripe's URLs pass through as is.
export function seeOther(request: Request, location: string): Response {
  const target = location.startsWith("/") ? new URL(location, request.url).toString() : location
  return new Response(null, { status: 303, headers: { ...NO_STORE, Location: target } })
}

export function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE })
}

// What a signed-out POST gets: a form goes to sign-in and comes back to the
// Plan tab afterwards; anything else gets a 401.
export function signedOut(request: Request): Response {
  if (isFormPost(request)) return seeOther(request, `/signin?next=${encodeURIComponent("/dashboard/plan")}`)
  return jsonError(401, "Sign in first.")
}
