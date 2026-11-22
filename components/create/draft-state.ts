// The live draft on the create page (issue #30), as a pure reducer over the
// chat events, next to chat-state.ts. While the builder writes, `draft` events
// replace the draft; `preview` marks it saved, and it stays on screen until the
// reloaded preview has loaded (`shown`), so the preview is never blank. A draft
// that was never saved (the build failed, the turn ended) is dropped: only
// saved content stays on screen.
import type { CalendarDraft, ChatEvent, LetterDraft } from "@/lib/agents/events"
import type { TemplateId } from "@/lib/letters/schema"

export type DraftView = { templateId: TemplateId; phase: "writing" | "saved" } & (
  | { kind: "letter"; content: LetterDraft }
  | { kind: "calendar"; content: CalendarDraft }
)

export type DraftState = {
  draft: DraftView | null
  // Goes up by one with every draft event, so a phone can mark the Preview button.
  changes: number
}

export type DraftAction =
  | { type: "event"; event: ChatEvent }
  // The request failed or the stream ended without `done`.
  | { type: "ended" }
  // The preview of the saved content has loaded.
  | { type: "shown" }

export const initialDraftState: DraftState = { draft: null, changes: 0 }

const BUILDER_TOOLS = new Set(["build_letter", "edit_letter"])

function dropUnsaved(state: DraftState): DraftState {
  return state.draft?.phase === "writing" ? { ...state, draft: null } : state
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  if (action.type === "ended") return dropUnsaved(state)
  if (action.type === "shown") return state.draft?.phase === "saved" ? { ...state, draft: null } : state

  const event = action.event
  switch (event.type) {
    case "draft": {
      const draft =
        event.kind === "calendar"
          ? { kind: "calendar" as const, templateId: event.templateId, content: event.content, phase: "writing" as const }
          : { kind: "letter" as const, templateId: event.templateId, content: event.content, phase: "writing" as const }
      return { draft, changes: state.changes + 1 }
    }
    case "preview":
      return state.draft?.phase === "writing" ? { ...state, draft: { ...state.draft, phase: "saved" } } : state
    case "tool":
      return event.status === "error" && BUILDER_TOOLS.has(event.name) ? dropUnsaved(state) : state
    case "error":
    case "refusal":
    case "done":
      return dropUnsaved(state)
    default:
      return state
  }
}

// ---------- What the draft sheet shows (draft-sheet.tsx) ----------

type Slot = { key: string; text: string }

// Every piece of text in reading order, to find the one that just changed.
export function slotsOf(draft: DraftView): Slot[] {
  const slots: Slot[] = []
  const add = (key: string, value: unknown) => slots.push({ key, text: typeof value === "string" ? value : JSON.stringify(value ?? "") })
  if (draft.kind === "letter") {
    const c = draft.content
    add("recipientName", c.recipientName)
    add("occasion", c.occasion)
    add("headline", c.headline)
    ;(c.body ?? []).forEach((p, i) => add(`body.${i}`, p))
    add("signOff", c.signOff)
    add("senderName", c.senderName)
    add("event", c.event)
    ;(c.gifts ?? []).forEach((g, i) => add(`gifts.${i}`, g))
  } else {
    const c = draft.content
    add("recipientName", c.recipientName)
    add("headline", c.headline)
    add("intro", c.intro)
    ;(c.doors ?? []).forEach((d, i) => add(`doors.${i}`, d))
  }
  return slots
}

// The last slot, in reading order, whose text differs from the previous draft.
export function changedSlot(previous: Map<string, string>, slots: Slot[]): string | null {
  let changed: string | null = null
  for (const slot of slots) if (slot.text && previous.get(slot.key) !== slot.text) changed = slot.key
  return changed
}

// "Thursday 24 December 2026, 19:00" from local ISO 8601 as the builder writes
// it, read as written (the time is the event's own). Null while unfinished.
export function eventWhen(startsAt: string | undefined): string | null {
  const m = startsAt ? /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(startsAt) : null
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(m[3])) return null
  const day = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date)
  return m[4] ? `${day}, ${m[4]}:${m[5]}` : day
}
