// GET /api/purchases?letterId=<uuid>: what the "Make it unique" button needs
// for one of the sender's letters: whether they must create an account first,
// whether the letter can have a wrapper, and its newest purchase (to show the
// status instead of the button while a design is on its way, or done).
//
// 200 WrapperState (lib/billing/view.ts); 400 for a bad id; 401 without a
// session; 404 for a letter that is not the sender's. Read through row-level
// security, so nobody sees another sender's letters or purchases.
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
    const [letter, purchase] = await Promise.all([getMyLetterForWrapper(letterId), getMyLatestPurchaseForLetter(letterId)])
    if (!letter) return jsonError(404, "Unknown gift.")
    const state: WrapperState = {
      account: user.is_anonymous === true ? "guest" : "member",
      unavailable: letter.kind !== "letter" ? "not_a_letter" : letter.built ? null : "not_built",
      purchase: purchase ? toPurchaseView(purchase) : null,
    }
    return Response.json(state, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("purchases lookup failed", error instanceof Error ? error.message : error)
    return jsonError(500, "Could not load this gift's purchases.")
  }
}
