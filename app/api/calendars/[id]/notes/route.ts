// POST /api/calendars/<id>/notes: Majnu writes the empty door notes (issue
// #48), all at once, in one builder call. Notes the sender wrote and every
// gift stay as they are. Answers NotesResponse with the content as saved.
//
// At most NOTES_PER_DAY runs a day per user, over all their calendars; a run
// that fails is given back. Errors ({ error, reason }): 401, 403 guest, 404 not
// the sender's calendar, 429 notes_daily, 422 the model declined, 503 busy,
// 500 anything else.
import Anthropic from "@anthropic-ai/sdk"
import { BuilderRefusal } from "@/lib/agents/builder"
import { describeError } from "@/lib/agents/errors"
import { calendarProgress, hasNote, mergeNotes } from "@/lib/calendars/doors"
import { writeNotes } from "@/lib/calendars/notes"
import { calendarUser, errorResponse, NOT_FOUND, respond } from "@/lib/calendars/route"
import { claimNotesRun, getMyCalendarSession, NOTES_PER_DAY, releaseNotesRun, type CalendarSession } from "@/lib/calendars/sessions"
import type { NotesResponse } from "@/lib/calendars/types"
import { CalendarContent, CalendarTemplateId } from "@/lib/letters/schema"
import { getMyLetter, updateMyCalendar } from "@/lib/letters/store"
import { startOfUtcDay } from "@/lib/limits"

export const dynamic = "force-dynamic"

async function claim(session: CalendarSession, now: Date) {
  const since = startOfUtcDay(now)
  const first = await claimNotesRun(session, now, since)
  if (first.ok || first.reason === "limit") return first
  // The session changed since it was read (a pool was saved): read it again once.
  const fresh = await getMyCalendarSession(session.marker.letterId)
  return fresh ? claimNotesRun(fresh, now, since) : first
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await calendarUser()
  if (user instanceof Response) return user
  const { id } = await params
  const now = new Date()

  try {
    const letter = await getMyLetter(id)
    const content = letter?.kind === "calendar" ? CalendarContent.safeParse(letter.content) : null
    const templateId = CalendarTemplateId.safeParse(letter?.templateId)
    if (!letter || !content?.success || !templateId.success) return errorResponse(404, { error: NOT_FOUND, reason: "not_found" })
    const session = await getMyCalendarSession(letter.id)
    if (!session) return errorResponse(404, { error: "Majnu writes notes for calendars started from Create, Advent calendar.", reason: "not_found" })

    if (content.data.doors.every(hasNote)) {
      const answer: NotesResponse = { content: content.data, written: 0, progress: calendarProgress(content.data) }
      return respond(200, answer)
    }

    const claimed = await claim(session, now)
    if (!claimed.ok) {
      return errorResponse(429, {
        error: `Majnu has written notes ${NOTES_PER_DAY} times today, the most for one day. Write the rest yourself, or come back tomorrow.`,
        reason: "notes_daily",
      })
    }

    let written: CalendarContent
    try {
      written = await writeNotes({
        content: content.data,
        templateId: templateId.data,
        marker: {
          kind: session.marker.kind,
          about: session.marker.about,
          relationship: session.context.relationship,
          interests: session.context.interests,
        },
        language: session.context.language,
        now,
      })
    } catch (error) {
      await releaseNotesRun(session, claimed.at)
      console.error("[calendars] notes failed", describeError(error))
      if (error instanceof BuilderRefusal) {
        return errorResponse(422, { error: "Majnu can't write notes for this one. Write them yourself, or change what is behind the doors.", reason: "failed" })
      }
      if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) {
        return errorResponse(503, { error: "A lot of people are making gifts right now. Try again in a minute.", reason: "failed" })
      }
      return errorResponse(500, { error: "Something went wrong writing the notes. Try again.", reason: "failed" })
    }

    // Merged into the doors as they are now, in case the sender saved one meanwhile.
    let count = 0
    const saved = await updateMyCalendar(letter.id, (latest) => {
      const merged = mergeNotes(latest, written, templateId.data)
      count = merged.written
      return merged.content
    })
    const answer: NotesResponse = { content: saved.content, written: count, progress: calendarProgress(saved.content) }
    return respond(200, answer)
  } catch (error) {
    if (error instanceof Error && error.message === "Letter not found") return errorResponse(404, { error: NOT_FOUND, reason: "not_found" })
    console.error("[calendars] could not write notes", describeError(error))
    return errorResponse(500, { error: "Something went wrong writing the notes. Try again.", reason: "failed" })
  }
}
