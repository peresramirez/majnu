// Majnu writes the door notes (issue #48): one call to the existing builder
// (lib/agents/builder.ts, structured output of CalendarContent) for every door
// at once. The brief carries each door's gift and the notes the sender already
// wrote; afterwards mergeNotes() fills only the empty notes and keeps every
// gift exactly as picked, so the builder can neither change nor add a gift.
import "server-only"
import { buildContent } from "@/lib/agents/builder"
import { doorOpensOn } from "@/lib/letters/public-view"
import type { CalendarContent, CalendarTemplateId } from "@/lib/letters/schema"
import { hasNote } from "./doors"
import type { CalendarMarker } from "./sessions"

export type NotesInput = {
  content: CalendarContent
  templateId: CalendarTemplateId
  // What the sender told us about the person; absent for a calendar without a session.
  marker?: Pick<CalendarMarker, "kind" | "about"> & { relationship?: string; interests?: string[] }
  language: string
  now: Date
}

function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code
  } catch {
    return code
  }
}

function oneLine(text: string, max = 300): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max)
}

// The builder's brief. Everything it needs is here, because it sees nothing else.
export function notesBrief(input: Omit<NotesInput, "now">): string {
  const { content, marker } = input
  const count = content.doors.length
  const language = input.language || "en"
  const lines = [
    `The sender is filling a ${input.templateId === "advent-classic" ? "24-door advent calendar" : `countdown of ${count} days`} on Majnu, door by door, and wants you to write the short note behind each door.`,
    `Write everything in ${languageName(language)} (${language}).`,
    `Recipient's name: ${content.recipientName}.${marker?.relationship ? ` Who they are to the sender: ${marker.relationship}.` : ""}`,
    `Sender's name: ${content.senderName}.`,
  ]
  if (marker?.interests?.length) lines.push(`They love: ${marker.interests.join(", ")}.`)
  if (marker?.about) lines.push("What the sender said about them, in their own words:", "<about>", oneLine(marker.about, 1000), "</about>")
  lines.push(
    `startDate: ${content.startDate}. timezone: ${content.timezone}. Return exactly ${count} doors, days 1 to ${count}, in this order.`,
    "For every door, a short title and a note of one to three sentences, each different from the others. Where a door has a gift, the note leads to it warmly without repeating its price or link. Where it has none, the note is the gift: a memory to recall, a small plan, a little dare. Build towards the last door.",
    "Do not invent memories or facts about their lives. Gifts are already chosen: put no gift on any door.",
    "Also write a headline under 60 characters and a one-sentence intro.",
    "The doors:",
  )
  content.doors.forEach((door) => {
    const opens = doorOpensOn(content.startDate, door.day)
    if (hasNote(door)) {
      lines.push(`${door.day} (${opens}): the sender wrote this note; copy it unchanged. Title: ${oneLine(door.title) || "(none)"}. Note: ${oneLine(door.message, 600)}`)
    } else if (door.gift) {
      const about = door.gift.description ? ` (${oneLine(door.gift.description, 200)})` : ""
      lines.push(`${door.day} (${opens}): gift: ${oneLine(door.gift.title, 120)}${about}`)
    } else {
      lines.push(`${door.day} (${opens}): no gift`)
    }
  })
  return lines.join("\n")
}

// The builder's content for the calendar. The caller merges it with mergeNotes().
export async function writeNotes(input: NotesInput): Promise<CalendarContent> {
  const built = await buildContent({
    mode: "build",
    templateId: input.templateId,
    brief: notesBrief(input),
    now: input.now,
    timezone: input.content.timezone,
  })
  if (built.kind !== "calendar") throw new Error(`The builder returned a ${built.kind} for ${input.templateId}`)
  return built.content
}
