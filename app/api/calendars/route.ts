// POST /api/calendars: starts an advent calendar or countdown that the sender
// fills door by door (issue #48). Saves a calendar with every door empty as the
// sender's letter, and its finder session with who it is for and the budget,
// for the pool of ideas. Answers { letterId, slug }; the editor lives at
// /dashboard/calendars/<letterId>.
//
// Errors ({ error, reason }): 401 no session, 403 a guest (calendars need a
// real account), 400 a bad body, 429 the daily letter limit, 500 anything else.
import { titleFor } from "@/lib/agents/builder"
import { resolveTimezone } from "@/lib/agents/context"
import { describeError } from "@/lib/agents/errors"
import { initialContent } from "@/lib/calendars/doors"
import { CalendarSetupBody } from "@/lib/calendars/requests"
import { calendarUser, errorResponse, INVALID, readJson, respond } from "@/lib/calendars/route"
import { createCalendarSession } from "@/lib/calendars/sessions"
import type { CreateCalendarResponse } from "@/lib/calendars/types"
import { baseContext, cleanAgeRange, defaultAgeRange, requestLocation } from "@/lib/finder/context"
import type { FinderContext } from "@/lib/finder/events"
import { createLetter, saveLetterContent } from "@/lib/letters/store"
import { canCreateLetter } from "@/lib/limits"

export const dynamic = "force-dynamic"

export async function POST(request: Request): Promise<Response> {
  const user = await calendarUser()
  if (user instanceof Response) return user

  const body = CalendarSetupBody.safeParse(await readJson(request))
  if (!body.success) return errorResponse(400, { error: INVALID, reason: "invalid" })
  const setup = body.data

  try {
    const letters = await canCreateLetter()
    if (!letters.ok) return errorResponse(429, { error: letters.message, reason: "daily_letters" })

    const timezone = resolveTimezone(setup.timezone)
    const base = baseContext(requestLocation(request), setup.locale)
    const ageRange = cleanAgeRange(setup.ageMin !== undefined || setup.ageMax !== undefined ? { min: setup.ageMin, max: setup.ageMax } : undefined) ?? defaultAgeRange(setup.kind)
    const context: FinderContext = {
      ...base,
      relationship: setup.relationship,
      ...(ageRange ? { ageRange } : {}),
      budget: setup.doorBudget,
      ...(setup.interests.length ? { interests: setup.interests } : {}),
    }
    const content = initialContent({
      templateId: setup.templateId,
      days: setup.days,
      recipientName: setup.recipientName,
      senderName: setup.senderName,
      startDate: setup.startDate,
      timezone,
    })

    const created = await createLetter()
    await saveLetterContent(created.id, {
      kind: "calendar",
      templateId: setup.templateId,
      title: titleFor(setup.templateId, setup.recipientName),
      content,
    })
    await createCalendarSession({
      ownerId: user.id,
      context,
      timezone,
      marker: {
        letterId: created.id,
        name: setup.recipientName,
        kind: setup.kind,
        ...(setup.ageMin !== undefined ? { age: setup.ageMin } : {}),
        ...(setup.about ? { about: setup.about } : {}),
        doorBudget: setup.doorBudget,
        ...(setup.lastDoorBudget ? { lastDoorBudget: setup.lastDoorBudget } : {}),
        ...(setup.profileLink ? { profileLink: setup.profileLink } : {}),
        notesRuns: [],
      },
    })
    const answer: CreateCalendarResponse = { letterId: created.id, slug: created.slug }
    return respond(200, answer)
  } catch (error) {
    console.error("[calendars] could not start a calendar", describeError(error))
    return errorResponse(500, { error: "Something went wrong starting the calendar. Try again.", reason: "failed" })
  }
}
