// POST /api/calendars/<id>/pool: Majnu's ideas for a calendar (issue #48).
// Without a body (or {}), one research run finds a new pool of 12 to 30 small
// gifts for the person and replaces the last pool; with { similarTo } it adds
// a few ideas like that one ("more like this"). Answers PoolResponse.
//
// A pool counts as one finder search (daily limits and the site cap) and at
// most two pools a day; "more like this" counts as a personalised search.
// Errors ({ error, reason }): 401, 403 guest, 400 bad body, 404 not the
// sender's calendar or not an idea in its pool, 409 the pool is full, 429 a
// limit, 422 the model declined, 502/503 research failed (nothing counted).
import { describeError } from "@/lib/agents/errors"
import { runPool } from "@/lib/calendars/pool"
import { PoolBody } from "@/lib/calendars/requests"
import { calendarUser, errorResponse, INVALID, NOT_FOUND, readJson, respond } from "@/lib/calendars/route"
import { getMyCalendarSession } from "@/lib/calendars/sessions"
import type { PoolResponse } from "@/lib/calendars/types"
import { getMyLetter } from "@/lib/letters/store"
import { CalendarContent, CalendarTemplateId } from "@/lib/letters/schema"

export const dynamic = "force-dynamic"

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await calendarUser()
  if (user instanceof Response) return user
  const { id } = await params

  const raw = await readJson(request)
  const body = PoolBody.safeParse(raw ?? {})
  if (!body.success) return errorResponse(400, { error: INVALID, reason: "invalid" })

  try {
    const letter = await getMyLetter(id)
    const content = letter?.kind === "calendar" ? CalendarContent.safeParse(letter.content) : null
    const templateId = CalendarTemplateId.safeParse(letter?.templateId)
    if (!letter || !content?.success || !templateId.success) return errorResponse(404, { error: NOT_FOUND, reason: "not_found" })
    const session = await getMyCalendarSession(letter.id)
    if (!session) {
      return errorResponse(404, { error: "Ideas are for calendars started from Create, Advent calendar.", reason: "not_found" })
    }

    const outcome = await runPool({ session, content: content.data, templateId: templateId.data, similarTo: body.data.similarTo, now: new Date() })
    if (!outcome.ok) return errorResponse(outcome.status, { error: outcome.message, reason: outcome.reason })
    const answer: PoolResponse = { pool: outcome.pool, lastDoorId: outcome.lastDoorId, added: outcome.added }
    return respond(200, answer)
  } catch (error) {
    console.error("[calendars] pool failed", describeError(error))
    return errorResponse(500, { error: "Something went wrong looking for ideas. Try again.", reason: "failed" })
  }
}
