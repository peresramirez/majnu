// The wire protocol between POST /api/chat and the chat UI
// (components/create/use-letter-chat.ts). The route streams one JSON ChatEvent
// per line (newline-delimited JSON, content type application/x-ndjson).
import type { LetterKind, TemplateId } from "@/lib/letters/schema"

export type ChatRequest = {
  // Absent on the first message of a new gift: the route creates the letter and
  // sends a `letter` event first, so the client can move to /create/<id>.
  letterId?: string
  message: string
  // The sender's IANA timezone from the browser, e.g. "Europe/Berlin".
  timezone?: string
}

export type GiftIdea = {
  title: string
  reason: string
  price?: string
  url?: string
}

// "signin_required": a guest (anonymous account) asked for something that needs
// a real account, such as a calendar. The chat should offer sign-up, not a plan.
export type LimitReason = "daily_letters" | "chat_turns" | "monthly_gifts" | "full_moon_only" | "signin_required"

// A live draft (issue #30, added after setup): the page as the builder is
// writing it, for the owner's create page only. Every field may be missing or
// unfinished. Drafts leave out gift codes, links, images, the theme and the
// gift list, and are never stored: only the saved content reaches /l/<slug>.
export type DraftGift = { title: string; description?: string; price?: string }

export type LetterDraft = {
  recipientName?: string
  senderName?: string
  occasion?: string
  headline?: string
  body?: string[]
  signOff?: string
  gifts?: DraftGift[]
  event?: { title?: string; startsAt?: string; locationName?: string; address?: string }
}

export type CalendarDraft = {
  recipientName?: string
  senderName?: string
  headline?: string
  intro?: string
  startDate?: string
  // In door order: door N is the Nth item.
  doors?: Array<{ title?: string; message?: string; gift?: DraftGift }>
}

export type DraftEvent = { type: "draft"; letterId: string; templateId: TemplateId } & (
  | { kind: "letter"; content: LetterDraft }
  | { kind: "calendar"; content: CalendarDraft }
)

export type ChatEvent =
  | { type: "letter"; letterId: string }
  | { type: "text"; delta: string }
  // A sub-agent or tool started or finished; `label` is the status line, e.g. "Looking for gift ideas…".
  | { type: "tool"; name: string; status: "start" | "done" | "error"; label: string }
  | { type: "templates"; ids: TemplateId[] }
  | { type: "gifts"; ideas: GiftIdea[] }
  // The builder is writing: show the draft so far. Sent a few times a second
  // while it streams, and always followed by `preview` once the content is
  // saved, or by a tool `error` when it could not be.
  | DraftEvent
  // The letter's content was built or changed: reload the preview.
  | { type: "preview"; letterId: string; kind: LetterKind; templateId: TemplateId }
  | { type: "limit"; reason: LimitReason; message: string }
  | { type: "refusal"; message: string }
  | { type: "error"; message: string }
  | { type: "done" }

// A stored conversation turned into what the chat UI shows when a gift is reopened.
export type DisplayMessage = {
  role: "user" | "assistant"
  text: string
  templates?: TemplateId[]
  gifts?: GiftIdea[]
}
