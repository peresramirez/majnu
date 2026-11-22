// POST /api/credits/checkout: opens Stripe-hosted Checkout, in payment mode,
// for personalisations bought in advance (issue #96). The Purchases tab posts
// JSON here:
//
//   { "quantity": 3 }
//
// The line item is the wrapper's Price (STRIPE_PRICE_WRAPPER) x quantity. The
// owner comes from the session cookie and the quantity is checked (1 to 5)
// before anything reaches Stripe; the metadata Stripe carries back is written
// on the server (lib/billing/credits.ts). Nothing is recorded until Stripe
// says the session is paid.
//
// 200 { url } to redirect to; 400 for a bad quantity; 401 without a session;
// 403 for a cross-site post or a guest account; 415 for anything but JSON;
// 502 when Stripe fails.
import { isJsonPost, isSameOriginPost, jsonError, siteOrigin } from "@/lib/billing/http"
import { startCreditsCheckout, type TopUpRefusal } from "@/lib/billing/credits"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const STATUS: Record<TopUpRefusal, number> = { invalid_quantity: 400, account_required: 403 }

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
    const result = await startCreditsCheckout(
      { id: user.id, email: user.email ?? null, isAnonymous: user.is_anonymous === true },
      { quantity: body.quantity },
      siteOrigin(request),
    )
    if (result.kind === "refused") {
      return Response.json({ error: result.message, reason: result.reason }, { status: STATUS[result.reason], headers: NO_STORE })
    }
    return Response.json({ url: result.url }, { headers: NO_STORE })
  } catch (error) {
    console.error("credits checkout failed", error instanceof Error ? error.message : error)
    return jsonError(502, "We couldn't reach Stripe just now. Nothing was charged. Try again in a moment.")
  }
}
