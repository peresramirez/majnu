// Where to send someone after they sign in. The landing page's "Choose Full
// moon" links to /signin?plan=full-moon, and protected routes can pass
// ?next=/some/path; both are carried through email and Google sign-in.
//
// Only same-site paths are accepted, so a crafted sign-in link can never send
// someone to another site (an open redirect). This file is pure and has no
// `server-only` import on purpose: the sign-in forms, the server actions, the
// OAuth callback and the middleware all use the same check.

const DEFAULT_AFTER_SIGN_IN = "/dashboard"
const PLAN_PAGE = "/dashboard/plan"
const MAX_LENGTH = 512

// Sending a signed-in user back to a sign-in page would only bounce them on.
const NOT_A_DESTINATION = ["/signin", "/signup", "/auth"]

// A path on this site, starting with exactly one "/", or null.
// Rejected: "//host" and "/\host" (both read as another host by browsers),
// schemes ("https:", "javascript:"), backslashes anywhere, whitespace and
// control characters (the URL parser strips tabs and newlines, which can turn
// "/\t/host" into "//host"), and anything that resolves to another origin.
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_LENGTH) return null
  if (!value.startsWith("/") || value.startsWith("//")) return null
  if (/[\\\u0000- \u007f]/.test(value)) return null

  const base = "https://majnu.invalid"
  let url: URL
  try {
    url = new URL(value, base)
  } catch {
    return null
  }
  if (url.origin !== base) return null

  const path = `${url.pathname}${url.search}${url.hash}`
  if (NOT_A_DESTINATION.some((prefix) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))) return null
  return path
}

type SearchLike = { get(name: string): string | null }

// The destination carried by a sign-in URL's query: a valid `next` wins, then
// `plan=full-moon` means the Plan tab. Null means "the usual place".
export function nextPathFromSearch(search: SearchLike): string | null {
  const next = safeNextPath(search.get("next"))
  if (next) return next
  if (search.get("plan") === "full-moon") return PLAN_PAGE
  return null
}

export function afterSignInPath(next: unknown): string {
  return safeNextPath(next) ?? DEFAULT_AFTER_SIGN_IN
}

// "/signup" or "/signup?next=%2Fdashboard%2Fplan", for links between the
// sign-in pages that keep the destination.
export function withNext(pathname: string, next: string | null): string {
  return next ? `${pathname}?next=${encodeURIComponent(next)}` : pathname
}
