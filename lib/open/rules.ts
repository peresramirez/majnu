// Which tracking events count, decided from the public view of the letter at
// the moment the event arrives. Pure, so it can be unit-tested.
import type { PublicLetter } from "@/lib/letters/schema"

export type OpenEventType = "open" | "door_open" | "gift_click"

// The `day` to store for an event, or null to ignore it.
// - open: always day 0.
// - door_open: calendars only, for a door that exists and is open now.
// - gift_click: on a letter, day 0; on a calendar, a door that is open now.
// Events for locked doors are ignored, so nobody learns anything by sending them early.
export function trackedDay(view: PublicLetter, type: OpenEventType, day: number | undefined): number | null {
  if (type === "open") return 0

  if (view.kind === "letter") {
    if (type !== "gift_click" || (day !== undefined && day !== 0)) return null
    return 0
  }

  if (day === undefined || day < 1) return null
  const door = view.content.doors.find((d) => d.day === day)
  if (!door || door.locked) return null
  return day
}
