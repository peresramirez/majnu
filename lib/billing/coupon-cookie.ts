// The coupon code a visitor brought with them from a poster's QR code
// (GET /c/<code>, docs/features/coupons.md), kept for 30 days so "Make it
// unique" can open with it filled in.
//
// The cookie holds the normalised code and nothing else. It is set without
// asking the database (so the short link cannot be used to test codes), is
// HttpOnly (only the server reads it: GET /api/purchases hands it to the
// dialog of the same browser), Secure and SameSite=Lax, and is cleared once a
// code is redeemed. Pure apart from the request: no server-only imports.
import { normaliseCouponCode } from "./coupon-code"

export const COUPON_COOKIE = "majnu_coupon"
export const COUPON_COOKIE_MAX_AGE = 30 * 24 * 60 * 60

const ATTRIBUTES = "Path=/; HttpOnly; Secure; SameSite=Lax"

// A Set-Cookie value that remembers the code, or null when it cannot be a code.
export function rememberCouponCookie(value: unknown): string | null {
  const code = normaliseCouponCode(value)
  return code ? `${COUPON_COOKIE}=${code}; Max-Age=${COUPON_COOKIE_MAX_AGE}; ${ATTRIBUTES}` : null
}

export function clearCouponCookie(): string {
  return `${COUPON_COOKIE}=; Max-Age=0; ${ATTRIBUTES}`
}

// The remembered code, normalised, or null. A cookie that was tampered with
// into something that cannot be a code counts as none.
export function rememberedCouponCode(request: Request): string | null {
  const header = request.headers.get("cookie")
  if (!header) return null
  for (const part of header.split(";")) {
    const at = part.indexOf("=")
    if (at < 0 || part.slice(0, at).trim() !== COUPON_COOKIE) continue
    let value = part.slice(at + 1).trim()
    try {
      value = decodeURIComponent(value)
    } catch {
      return null
    }
    return normaliseCouponCode(value)
  }
  return null
}
