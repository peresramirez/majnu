// PUT /api/calendars/<id>/doors/<day>: fills one door (issue #48) with one of
// Majnu's ideas, the sender's own gift, or a note only, plus the door's note.
// Answers DoorResponse: the door as saved and the calendar's progress.
//
// An idea is looked up in the calendar's stored pool and copied onto
// CalendarDoor.gift on the server (giftFromOption), so what is behind the door
// is exactly what was shown. Errors ({ error, reason }): 401, 403 guest, 400 a
// bad body or own gift, 404 not the sender's calendar, no such door or idea.
import { describeError } from "@/lib/agents/errors"
import { calendarProgress, giftFromOption, ownGift, setDoor } from "@/lib/calendars/doors"
import { DoorBody, parseDay } from "@/lib/calendars/requests"
import { calendarUser, errorResponse, INVALID, NOT_FOUND, readJson, respond } from "@/lib/calendars/route"
import { getMyCalendarSession } from "@/lib/calendars/sessions"
import type { DoorResponse } from "@/lib/calendars/types"
import type { Gift } from "@/lib/letters/schema"
import { updateMyCalendar } from "@/lib/letters/store"

export const dynamic = "force-dynamic"

class NoSuchDoor extends Error {}

const OWN_GIFT_PROBLEMS = {
  title: "Write what the gift is.",
  url: "Links must start with https://.",
} as const

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; day: string }> }): Promise<Response> {
  const user = await calendarUser()
  if (user instanceof Response) return user
  const { id, day: dayParam } = await params
  const day = parseDay(dayParam)
  if (day === null) return errorResponse(404, { error: "That door was not found.", reason: "not_found" })

  const body = DoorBody.safeParse(await readJson(request))
  if (!body.success) return errorResponse(400, { error: INVALID, reason: "invalid" })
  const choice = body.data.gift

  try {
    let picked: Gift | undefined
    if (choice?.type === "idea") {
      const session = await getMyCalendarSession(id)
      const option = session?.pool?.options.find((o) => o.id === choice.optionId)
      if (!option) return errorResponse(404, { error: "That idea is no longer in the list. Choose another one.", reason: "not_found" })
      picked = giftFromOption(option)
    } else if (choice?.type === "own") {
      const own = ownGift(choice)
      if (!own.ok) return errorResponse(400, { error: OWN_GIFT_PROBLEMS[own.problem], reason: "invalid" })
      picked = own.gift
    }

    const saved = await updateMyCalendar(id, (current) => {
      const door = current.doors.find((d) => d.day === day)
      if (!door) throw new NoSuchDoor()
      const gift = choice?.type === "keep" ? door.gift : picked
      return setDoor(current, day, { gift, title: body.data.title, message: body.data.message })
    })
    const door = saved.content.doors.find((d) => d.day === day)!
    const answer: DoorResponse = { door, progress: calendarProgress(saved.content) }
    return respond(200, answer)
  } catch (error) {
    if (error instanceof NoSuchDoor) return errorResponse(404, { error: "That door was not found.", reason: "not_found" })
    if (error instanceof Error && error.message === "Letter not found") return errorResponse(404, { error: NOT_FOUND, reason: "not_found" })
    console.error("[calendars] could not save a door", describeError(error))
    return errorResponse(500, { error: "Something went wrong saving the door. Try again.", reason: "failed" })
  }
}
