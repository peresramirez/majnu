// POST /api/designs/free: one of the day's free personalised wrappers (issue
// #85, docs/features/free-designs.md). The "Make it unique" dialog posts JSON
// here while this connection has free designs left today:
//
//   { "letterId": "<uuid>", "request": "a 1950s cinema ticket by the sea" }
//
// It takes one of the day's uses for the visitor's IP address (counted by a
// keyed daily hash, never the address), records the purchase as paid with
// amount 0 and starts the design run as a paid purchase does. There is no
// Checkout and no consent box (nothing is paid), and guests may use it
// without creating an account.
//
// 200 { purchase: PurchaseView, freeDesigns: { left, perDay } }; 400 for a bad
// body or a missing request; 401 without a session; 403 for a cross-site
// post; 404 for a letter that is not the sender's; 409 when a design for the
// letter is already on its way; 415 for anything but JSON; 422 for a calendar
// or an unbuilt letter; 429 when this connection has used today's free
// designs; 502 when the design could not be started (the free design is given
// back); 503 when free designs are not offered (switched off, or the address
// is unknown).
import { isJsonPost, isSameOriginPost, jsonError } from "@/lib/billing/http"
import { claimFreeDesign, type FreeDesignRefusal } from "@/lib/billing/free-designs"
import { toPurchaseView } from "@/lib/billing/view"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const STATUS: Record<FreeDesignRefusal, number> = {
  invalid_request: 400,
  letter_not_found: 404,
  in_progress: 409,
  not_a_letter: 422,
  not_built: 422,
  free_used_up: 429,
  free_unavailable: 503,
}

const NO_STORE = { "Cache-Control": "no-store" }

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
    const result = await claimFreeDesign({ id: user.id }, { letterId: body.letterId, request: body.request }, request.headers)
    if (result.kind === "refused") {
      return Response.json(
        { error: result.message, reason: result.reason, freeDesigns: result.freeDesigns },
        { status: STATUS[result.reason], headers: NO_STORE },
      )
    }
    return Response.json(
      { purchase: toPurchaseView({ ...result.purchase, letter: result.letter }), freeDesigns: result.freeDesigns },
      { headers: NO_STORE },
    )
  } catch (error) {
    // The message names the step that failed, never the address.
    console.error("free design failed", error instanceof Error ? error.message : error)
    return jsonError(502, "We couldn't start your design just now. It didn't use one of your free designs. Try again in a moment.")
  }
}
