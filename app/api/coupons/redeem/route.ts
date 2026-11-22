// POST /api/coupons/redeem: a personalised wrapper paid with a coupon code
// instead of Stripe (docs/features/coupons.md). The "Make it unique" dialog
// posts JSON here when the sender typed a code:
//
//   { "letterId": "<uuid>", "request": "a 1950s cinema ticket by the sea",
//     "coupon": "K7QM-3XRA-PD9C-WHTE" }
//
// A valid code takes one use, records the purchase as paid (amount 0) and
// starts the design run as a paid purchase does. There is no Checkout and no
// consent box (nothing is paid), and guests may redeem without creating an
// account. Kept apart from POST /api/checkout so the paid path is unchanged.
//
// 200 { purchase: PurchaseView } for the status card; 400 for a bad body, a
// missing request or a code that doesn't work (unknown or disabled: the same
// answer); 401 without a session; 403 for a cross-site post; 404 for a letter
// that is not the sender's; 409 when a design for the letter is already on
// its way, or this user has used this code already (one use per person); 410
// for a code that is used up or expired; 415 for anything but JSON; 422 for a
// calendar or an unbuilt letter; 502 when the design could not be started (the
// code keeps its use).
//
// A code remembered from a poster's short link (GET /c/<code>) is forgotten
// once a code is redeemed, or once that code is refused for good.
import { isJsonPost, isSameOriginPost, jsonError } from "@/lib/billing/http"
import { normaliseCouponCode } from "@/lib/billing/coupon-code"
import { clearCouponCookie, rememberedCouponCode } from "@/lib/billing/coupon-cookie"
import { redeemWrapperCoupon, type CouponRefusal } from "@/lib/billing/coupons"
import { toPurchaseView } from "@/lib/billing/view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const STATUS: Record<CouponRefusal, number> = {
  invalid_request: 400,
  code_invalid: 400,
  letter_not_found: 404,
  in_progress: 409,
  code_already_used: 409,
  code_used_up: 410,
  code_expired: 410,
  not_a_letter: 422,
  not_built: 422,
}

const NO_STORE = { "Cache-Control": "no-store" }

// Refusals after which the same code will not work for this person again.
const FINAL = new Set<CouponRefusal>(["code_invalid", "code_used_up", "code_expired", "code_already_used"])

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request)) return jsonError(403, "Cross-site request refused.")
  if (!isJsonPost(request)) return jsonError(415, "Send JSON.")

  // A member or a guest (an anonymous account from the gift finder).
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonError(401, "Sign in first.")

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object")
    body = parsed as Record<string, unknown>
  } catch {
    return jsonError(400, "Send a JSON object.")
  }

  try {
    const result = await redeemWrapperCoupon({ id: user.id }, { letterId: body.letterId, request: body.request, coupon: body.coupon })
    const remembered = rememberedCouponCode(request)
    if (result.kind === "refused") {
      const headers = new Headers(NO_STORE)
      // The remembered code will never work for this person: stop offering it.
      if (remembered && FINAL.has(result.reason) && normaliseCouponCode(body.coupon) === remembered) headers.set("Set-Cookie", clearCouponCookie())
      return Response.json({ error: result.message, reason: result.reason }, { status: STATUS[result.reason], headers })
    }
    const headers = new Headers(NO_STORE)
    if (remembered) headers.set("Set-Cookie", clearCouponCookie())
    return Response.json({ purchase: toPurchaseView({ ...result.purchase, letter: result.letter }) }, { headers })
  } catch (error) {
    console.error("coupon redeem failed", error instanceof Error ? error.message : error)
    return jsonError(502, "We couldn't start your design just now. Your code still works. Try again in a moment.")
  }
}
