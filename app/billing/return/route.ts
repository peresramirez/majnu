// GET /billing/return?session_id=cs_...: where Stripe Checkout sends the
// subscriber after paying. Retrieves the session from Stripe, checks it was
// created for the signed-in user and is complete, sets the plan, and redirects
// to the Plan tab. Nothing in the URL except the session id is used, and the
// id itself is only a key to look the session up in Stripe.
//
// Not under the middleware's protected prefixes, so the session is checked
// here: signed out, it goes to sign-in and comes back to this same URL.
import { seeOther } from "@/lib/billing/http"
import { confirmCheckout } from "@/lib/billing/service"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const sessionId = url.searchParams.get("session_id")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    const back = sessionId ? `/billing/return?session_id=${encodeURIComponent(sessionId)}` : "/dashboard/plan"
    return seeOther(request, `/signin?next=${encodeURIComponent(back)}`)
  }

  try {
    const outcome = await confirmCheckout({ id: user.id, email: user.email }, sessionId)
    if (outcome === "pending") return seeOther(request, "/dashboard/plan?billing=pending")
    if (outcome === "not_found") console.warn("billing return: session not confirmed for this user")
    return seeOther(request, "/dashboard/plan")
  } catch (error) {
    // The webhook still sets the plan; the Plan tab says to check back shortly.
    console.error("billing return failed", error instanceof Error ? error.message : error)
    return seeOther(request, "/dashboard/plan?billing=pending")
  }
}
