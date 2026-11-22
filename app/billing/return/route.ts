// GET /billing/return?session_id=cs_...: where Stripe Checkout sends the
// sender after paying for a personalised wrapper. Retrieves the session from
// Stripe, checks it was created for the signed-in user and one of their
// purchases, marks the purchase paid (the webhook does the same; whichever
// comes first wins, once) so the design starts, and redirects to the
// purchase's status on the Purchases tab. Nothing in the URL except the
// session id is used, and the id itself is only a key to look the session up.
//
// Not under the middleware's protected prefixes, so the session is checked
// here: signed out, it goes to sign-in and comes back to this same URL.
import { seeOther } from "@/lib/billing/http"
import { confirmCheckout } from "@/lib/billing/service"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const PURCHASES = "/dashboard/purchases"

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get("session_id")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const back = sessionId ? `/billing/return?session_id=${encodeURIComponent(sessionId)}` : PURCHASES
    return seeOther(request, `/signin?next=${encodeURIComponent(back)}`)
  }

  try {
    const result = await confirmCheckout({ id: user.id }, sessionId)
    if (result.outcome === "not_found") {
      console.warn("billing return: session not confirmed for this user")
      return seeOther(request, PURCHASES)
    }
    const notice = result.outcome === "processing" ? "&billing=processing" : ""
    return seeOther(request, `${PURCHASES}?purchase=${encodeURIComponent(result.purchaseId)}${notice}`)
  } catch (error) {
    // The webhook still marks it paid; the Purchases tab shows it when it does.
    console.error("billing return failed", error instanceof Error ? error.message : error)
    return seeOther(request, `${PURCHASES}?billing=processing`)
  }
}
