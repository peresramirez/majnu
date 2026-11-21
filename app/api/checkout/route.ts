// POST /api/checkout: opens Stripe-hosted Checkout, in payment mode, for one
// personalised wrapper (€2.99 once) for one of the sender's letters. The
// "Make it unique" dialog posts JSON here:
//
//   { "letterId": "<uuid>", "request": "a 1950s cinema ticket by the sea",
//     "consent": true, "returnTo": "/create/<uuid>" }
//
// `consent` is the box the sender ticked: they agree that the design is made
// at once and that this ends their right of withdrawal. Without it nothing is
// recorded and Checkout is not opened. The server stores its own copy of the
// consent sentence (lib/plans.ts), never text from the browser.
//
// 200 { url } to redirect to; 400 for a missing consent or request; 401
// without a session; 403 for a cross-site post or a guest account (create an
// account first); 404 for a letter that is not the sender's; 409 when a design
// for the letter is already on its way; 415 for anything but JSON; 422 for a
// calendar or an unbuilt letter; 502 when Stripe fails.
import { isJsonPost, isSameOriginPost, jsonError, siteOrigin } from "@/lib/billing/http"
import { startWrapperCheckout, type CheckoutRefusal } from "@/lib/billing/service"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const STATUS: Record<CheckoutRefusal, number> = {
  invalid_request: 400,
  consent_required: 400,
  account_required: 403,
  letter_not_found: 404,
  not_a_letter: 422,
  not_built: 422,
  in_progress: 409,
}

const NO_STORE = { "Cache-Control": "no-store" }

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginPost(request)) return jsonError(403, "Cross-site request refused.")
  if (!isJsonPost(request)) return jsonError(415, "Send JSON.")

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
    const result = await startWrapperCheckout(
      { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous === true },
      { letterId: body.letterId, request: body.request, consent: body.consent, returnTo: body.returnTo },
      siteOrigin(request),
    )
    if (result.kind === "refused") {
      return Response.json({ error: result.message, reason: result.reason }, { status: STATUS[result.reason], headers: NO_STORE })
    }
    return Response.json({ url: result.url }, { headers: NO_STORE })
  } catch (error) {
    console.error("checkout failed", error instanceof Error ? error.message : error)
    return jsonError(502, "We couldn't reach Stripe just now. Nothing was charged. Try again in a moment.")
  }
}
