// The words printed inside the pop-up wedding card. Pure, so it is tested
// without a GPU. Never a gift code: the card shows names, the date and place.
import type { LetterContent } from "@/lib/letters/schema"
import { eventDateParts, formatEventTime, type EventStart } from "../../event-time"
import { wholeName } from "../../names"
import { coupleNames } from "../wedding-envelope-3d/layout"

export type InviteWords = {
  occasion: string
  names: string
  forName: string
  headline: string
  weekday: string
  date: string
  time: string
  place: string
  address: string
}

export function inviteWords(content: LetterContent, start: EventStart | null): InviteWords {
  const parts = start ? eventDateParts(start) : null
  const event = content.event
  return {
    occasion: content.occasion || "You're invited",
    names: coupleNames(content.senderName) || content.senderName,
    forName: `For ${wholeName(content.recipientName)}`,
    headline: content.headline ?? "",
    weekday: parts?.weekday ?? "",
    date: parts ? `${parts.day} ${parts.month} ${parts.year}` : "",
    time: start ? `at ${formatEventTime(start)}` : "",
    place: event?.locationName ?? "",
    address: event?.address ?? "",
  }
}
