// GET /api/purchases?letterId=<uuid>: what the "Make it unique" button needs
// for one of the sender's letters: whether they must create an account first,
// whether the letter can have a wrapper, and its newest purchase (to show the
// status instead of the button while a design is on its way, or done), plus
// a coupon code this browser remembered from a poster's short link, so the
// dialog can open with it filled in (lib/billing/coupon-cookie.ts), and how
// many of today's free designs this connection has left
// (lib/billing/free-designs.ts; null when they are not offered), and how many
// personalisations a member bought in advance and has left (issue #96; null
// for guests).
//
// 200 WrapperState (lib/billing/view.ts); 400 for a bad id; 401 without a
// session; 404 for a letter that is not the sender's. Read through row-level
// security, so nobody sees another sender's letters or purchases.
import { rememberedCouponCode } from "@/lib/billing/coupon-cookie"
import { designCreditsBalance } from "@/lib/billing/credits"
import { freeDesignsLeft } from "@/lib/billing/free-designs"
import { jsonError } from "@/lib/billing/http"
import { getMyLatestPurchaseForLetter, getMyLetterForWrapper } from "@/lib/billing/my-purchases"
import { toPurchaseView, type WrapperState } from "@/lib/billing/view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: Request): Promise<Response> {
  const letterId = new URL(request.url).searchParams.get("letterId") ?? ""
  if (!UUID.test(letterId)) return jsonError(400, "Unknown gift.")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonError(401, "Sign in first.")

  try {
    const guest = user.is_anonymous === true
    const [letter, purchase, freeDesigns, credits] = await Promise.all([
      getMyLetterForWrapper(letterId),
      getMyLatestPurchaseForLetter(letterId),
      // A failure here must not hide the button: the dialog then offers what
      // it offered before free designs (a code, or payment).
      freeDesignsLeft(request.headers).catch((error: unknown) => {
        console.error("free designs lookup failed", error instanceof Error ? error.message : error)
        return null
      }),
      // Likewise: without the balance the dialog offers a code or payment.
      guest
        ? Promise.resolve(null)
        : designCreditsBalance(user.id).catch((error: unknown) => {
            console.error("credits lookup failed", error instanceof Error ? error.message : error)
            return null
          }),
    ])
    if (!letter) return jsonError(404, "Unknown gift.")
    const state: WrapperState = {
      account: guest ? "guest" : "member",
      unavailable: letter.kind !== "letter" ? "not_a_letter" : letter.built ? null : "not_built",
      purchase: purchase ? toPurchaseView(purchase) : null,
      rememberedCode: rememberedCouponCode(request),
      freeDesigns,
      credits,
    }
    return Response.json(state, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("purchases lookup failed", error instanceof Error ? error.message : error)
    return jsonError(500, "Could not load this gift's purchases.")
  }
}
