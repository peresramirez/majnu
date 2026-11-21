// POST /api/billing/portal: opens the Stripe customer portal for a Full moon
// subscriber, where they can cancel (Full moon then stays on until the end of
// the paid period), resume, or change their card. The Plan tab's "Manage or
// cancel" button posts a plain form here; the answer is a 303 to the portal.
//
// 401 (or a 303 to sign-in for a form) without a session, 403 for a
// cross-site post, 303 to /dashboard/plan when there is no subscription to
// manage, 303 to /dashboard/plan?billing=error if Stripe fails.
// Not gated on MAJNU_BILLING: whoever pays must always be able to cancel.
import { isSameOriginPost, jsonError, seeOther, signedOut, siteOrigin } from "@/lib/billing/http"
import { openPortal } from "@/lib/billing/service"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request)) return jsonError(403, "Cross-site request refused.")

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return signedOut(request)

  try {
    const url = await openPortal({ id: user.id, email: user.email }, siteOrigin(request))
    return seeOther(request, url ?? "/dashboard/plan")
  } catch (error) {
    console.error("billing portal failed", error instanceof Error ? error.message : error)
    return seeOther(request, "/dashboard/plan?billing=error")
  }
}
