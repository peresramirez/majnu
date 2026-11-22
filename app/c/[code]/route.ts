// GET /c/<code>: the short link behind a poster's QR code
// (docs/features/coupons.md). It remembers the coupon code for 30 days in a
// cookie (lib/billing/coupon-cookie.ts) and sends the visitor to the landing
// page; "Make it unique" then opens with the code filled in.
//
// It needs no session and asks the database nothing: whether the code works
// is decided only when it is redeemed, so this link cannot be used to test
// codes, and the response never shows the code. Something that cannot be a
// code clears any remembered one and lands on / all the same.
import { clearCouponCookie, rememberCouponCookie } from "@/lib/billing/coupon-cookie"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }): Promise<Response> {
  const { code } = await params
  let typed = code
  try {
    typed = decodeURIComponent(code)
  } catch {
    // Keep it as it came; normalising refuses it below if it is not a code.
  }
  return new Response(null, {
    status: 303,
    headers: {
      Location: new URL("/", request.url).toString(),
      "Set-Cookie": rememberCouponCookie(typed) ?? clearCouponCookie(),
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
    },
  })
}
