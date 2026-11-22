// POST /api/credits/use: uses one personalisation bought in advance for one
// of the sender's letters (issue #96). The "Make it unique" dialog posts JSON
// here when the sender has some left and no free design today:
//
//   { "letterId": "<uuid>", "request": "a 1950s cinema ticket by the sea",
//     "consent": true }
//
// `consent` is the box the sender ticked: the design starts at once, which
// ends the right of withdrawal for that one personalisation. The server
// stores its own copy of the sentence (lib/plans.ts). claim_design_credit()
// uses one and records the purchase as paid with amount 0, and the design run
// starts as a paid one does. Stripe is never called.
//
// 200 { purchase: PurchaseView, credits }; 400 for a bad body, a missing
// request or consent; 401 without a session; 403 for a cross-site post; 404
// for a letter that is not the sender's; 409 when a design for the letter is
// already on its way; 415 for anything but JSON; 422 for a calendar or an
// unbuilt letter; 402 when no personalisation is left; 502 when the design
// could not be started (the personalisation is given back).
import { isJsonPost, isSameOriginPost, jsonError } from "@/lib/billing/http"
import { claimDesignCredit, type CreditUseRefusal } from "@/lib/billing/credits"
import { toPurchaseView } from "@/lib/billing/view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const STATUS: Record<CreditUseRefusal, number> = {
  invalid_request: 400,
  consent_required: 400,
  letter_not_found: 404,
  in_progress: 409,
  not_a_letter: 422,
  not_built: 422,
  none_left: 402,
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
    const result = await claimDesignCredit({ id: user.id }, { letterId: body.letterId, request: body.request, consent: body.consent })
    if (result.kind === "refused") {
      return Response.json(
        { error: result.message, reason: result.reason, credits: result.balance },
        { status: STATUS[result.reason], headers: NO_STORE },
      )
    }
    return Response.json(
      { purchase: toPurchaseView({ ...result.purchase, letter: result.letter }), credits: result.balance },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error("credit use failed", error instanceof Error ? error.message : error)
    return jsonError(502, "We couldn't start your design just now. Your personalisation is still yours. Try again in a moment.")
  }
}
