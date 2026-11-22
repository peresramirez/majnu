// The words printed on the party ticket. Pure, so it is tested without a GPU.
// Never a gift code: the ticket shows who it is for, when and where.
import type { LetterContent } from "@/lib/letters/schema"
import { eventDateParts, formatEventTime, type EventStart } from "../../event-time"
import { wholeName } from "../../names"

export type TicketWords = {
  occasion: string
  forName: string
  headline: string
  from: string
  title: string
  weekday: string
  date: string
  time: string
  place: string
  address: string
  // A ticket number from the date, "No. 0305", or a plain "Admit one".
  number: string
}

export function ticketWords(content: LetterContent, start: EventStart | null): TicketWords {
  const parts = start ? eventDateParts(start) : null
  const event = content.event
  const number = start
    ? `No. ${String(start.instant.getUTCMonth() + 1).padStart(2, "0")}${String(start.instant.getUTCDate()).padStart(2, "0")}`
    : "Admit one"
  return {
    occasion: content.occasion || "You're invited",
    forName: `For ${wholeName(content.recipientName)}`,
    headline: content.headline ?? "",
    from: content.senderName ? `from ${content.senderName}` : "",
    title: event?.title ?? "",
    weekday: parts?.weekday ?? "",
    date: parts ? `${parts.day} ${parts.month}` : "",
    time: start ? formatEventTime(start) : "",
    place: event?.locationName ?? "",
    address: event?.address ?? "",
    number,
  }
}
