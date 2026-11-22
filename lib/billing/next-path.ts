// Where to send someone after they sign in. Protected routes and the
// "Make it unique" dialog pass ?next=/some/path, which is carried through email
// and Google sign-in.
//
// Only same-site paths are accepted, so a crafted sign-in link can never send
// someone to another site (an open redirect). This file is pure and has no
// `server-only` import on purpose: the sign-in forms, the server actions, the
// OAuth callback and the middleware all use the same check.

const DEFAULT_AFTER_SIGN_IN = "/dashboard"
// Old sign-in links from the retired subscription carried ?plan=full-moon;
// they now land on the Purchases tab.
const PURCHASES_PAGE = "/dashboard/purchases"
const MAX_LENGTH = 512

// Sending a signed-in user back to a sign-in page would only bounce them on.
const NOT_A_DESTINATION = ["/signin", "/signup", "/auth"]

// A path on this site, starting with exactly one "/", or null.
// Rejected: "//host" and "/\host" (both read as another host by browsers),
// schemes ("https:", "javascript:"), backslashes anywhere, whitespace and
// control characters (the URL parser strips tabs and newlines, which can turn
// "/\t/host" into "//host"), and anything that resolves to another origin.
export function safeNextPath(value: unknown): string | null {
  const path = sameSitePath(value)
  if (!path) return null
  const pathname = new URL(path, "https://majnu.invalid").pathname
  if (NOT_A_DESTINATION.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return null
  return path
}

// The same-site check on its own, without the sign-in exclusion: for links back
// to a page the visitor already saw (lib/navigation/back.ts), where a signed-out
// visitor may well want to return to the sign-in page they came from.
export function sameSitePath(value: unknown): string | null {
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

  return `${url.pathname}${url.search}${url.hash}`
}

type SearchLike = { get(name: string): string | null }

// The destination carried by a sign-in URL's query: a valid `next` wins, then
// an old `plan=full-moon` link means the Purchases tab. Null means "the usual place".
export function nextPathFromSearch(search: SearchLike): string | null {
  const next = safeNextPath(search.get("next"))
  if (next) return next
  if (search.get("plan") === "full-moon") return PURCHASES_PAGE
  return null
}

export function afterSignInPath(next: unknown): string {
  return safeNextPath(next) ?? DEFAULT_AFTER_SIGN_IN
}

// "/signup" or "/signup?next=%2Fdashboard%2Fpurchases", for links between the
// sign-in pages that keep the destination.
export function withNext(pathname: string, next: string | null): string {
  return next ? `${pathname}?next=${encodeURIComponent(next)}` : pathname
}
