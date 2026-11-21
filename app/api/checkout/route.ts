// POST /api/checkout: starts the Full moon subscription in Stripe-hosted
// Checkout. The Plan tab posts a plain HTML form here; the answer is a 303 to
// Checkout, or back to the Plan tab when there is nothing to buy.
//
// 401 (or a 303 to sign-in for a form) without a session, 403 for a
// cross-site post, 303 to /dashboard/plan when billing is off or the user
// already has Full moon, 303 to /dashboard/plan?billing=error if Stripe fails.
import { isSameOriginPost, jsonError, seeOther, signedOut, siteOrigin } from "@/lib/billing/http"
import { startCheckout } from "@/lib/billing/service"
import { billingEnabled } from "@/lib/limits"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request)) return jsonError(403, "Cross-site request refused.")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return signedOut(request)

  // Until billing is switched on, Full moon is free for everyone: nothing to buy.
  if (!billingEnabled()) return seeOther(request, "/dashboard/plan")

  try {
    const result = await startCheckout({ id: user.id, email: user.email }, siteOrigin(request))
    if (result.kind === "already_subscribed") return seeOther(request, "/dashboard/plan")
    return seeOther(request, result.url)
  } catch (error) {
    console.error("checkout failed", error instanceof Error ? error.message : error)
    return seeOther(request, "/dashboard/plan?billing=error")
  }
}
