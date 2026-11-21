// Addresses for the auth callback, shared by the Google server action and the
// email forms. Pure, so it is unit-tested and safe in both the browser and the
// server. Every destination goes through safeNextPath(): same-site paths only.
import { safeNextPath, withNext } from "@/lib/billing/next-path"

// Where Supabase sends the browser back after Google or an email link:
// /auth/callback, carrying a same-site `next` when there is one.
export function authCallbackUrl(siteUrl: string, next?: string | null): string {
  const callback = `${siteUrl.replace(/\/+$/, "")}/auth/callback`
  const destination = safeNextPath(next)
  return destination ? `${callback}?next=${encodeURIComponent(destination)}` : callback
}

// Error codes travel in the URL, so only short snake_case codes are kept;
// anything else becomes "unknown". The sign-in form maps codes to messages and
// never shows text taken from the URL.
export function safeAuthErrorCode(value: unknown): string {
  return typeof value === "string" && /^[a-z0-9_]{1,64}$/.test(value) ? value : "unknown"
}

// /signin?auth_error=<code>&next=<path>: where the callback sends a sign-in or
// link that went wrong, so the form can say what happened.
export function signInErrorPath(code: unknown, next?: string | null): string {
  const path = withNext("/signin", safeNextPath(next))
  const join = path.includes("?") ? "&" : "?"
  return `${path}${join}auth_error=${safeAuthErrorCode(code)}`
}
