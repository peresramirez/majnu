// POST /api/finder/wrap: wraps one of the options a finder session showed in a
// gift reveal, classic envelope or postcard, saved as the visitor's letter.
// Answers WrapResponse JSON (lib/finder/events.ts): { letterId, slug } on
// success, the page then lives at /l/<slug>.
//
// Errors: 401 { "error": "session_required" }; otherwise { error } with a
// short message in the visitor's language: 400 bad body, 404 session or option
// not found, 429 the daily letter limit, 403 the free plan's monthly gifts
// (only with MAJNU_BILLING=on), 422 the builder declined, 500 anything else.
import * as z from "zod/v4"
import { BuilderRefusal } from "@/lib/agents/builder"
import { describeError } from "@/lib/agents/errors"
import type { WrapResponse } from "@/lib/finder/events"
import { textsFor } from "@/lib/finder/messages"
import { getMyFinderSession } from "@/lib/finder/sessions"
import { WRAP_TEMPLATE_IDS, wrapOption } from "@/lib/finder/wrap"
import { canCreateLetter, canUseFeature } from "@/lib/limits"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

const WrapRequestBody = z.object({
  sessionId: z.string().min(1).max(100),
  optionId: z.string().min(1).max(64),
  templateId: z.enum(WRAP_TEMPLATE_IDS),
  recipientName: z.string().trim().max(60).optional(),
  senderName: z.string().trim().max(60).optional(),
  note: z.string().trim().max(1000).optional(),
})

function respond(status: number, body: WrapResponse): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return respond(401, { error: "session_required" })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return respond(400, { error: textsFor(undefined).requests.wrapFailed })
  }
  const body = WrapRequestBody.safeParse(raw)
  if (!body.success) return respond(400, { error: textsFor(undefined).requests.wrapFailed })

  try {
    const session = await getMyFinderSession(body.data.sessionId)
    if (!session) return respond(404, { error: textsFor(undefined).requests.sessionNotFound })
    const texts = textsFor(session.context.language)
    const option = session.lastOptions?.options.find((o) => o.id === body.data.optionId)
    if (!option) return respond(404, { error: texts.requests.optionNotFound })

    // The spending guard for letters, and the free plan's monthly gifts.
    const letters = await canCreateLetter()
    if (!letters.ok) return respond(429, { error: letters.message })
    const gift = await canUseFeature("new_gift")
    if (!gift.ok) return respond(403, { error: gift.message })

    try {
      const wrapped = await wrapOption({
        option,
        context: session.context,
        templateId: body.data.templateId,
        recipientName: body.data.recipientName || undefined,
        senderName: body.data.senderName || undefined,
        note: body.data.note || undefined,
        now: new Date(),
        timezone: session.timezone,
      })
      return respond(200, wrapped)
    } catch (error) {
      console.error("[finder] wrap failed", describeError(error))
      if (error instanceof BuilderRefusal) return respond(422, { error: texts.requests.wrapRefused })
      return respond(500, { error: texts.requests.wrapFailed })
    }
  } catch (error) {
    console.error("[finder] could not load the session or check limits", describeError(error))
    return respond(500, { error: textsFor(undefined).requests.wrapFailed })
  }
}
