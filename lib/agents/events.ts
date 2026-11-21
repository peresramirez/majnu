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

export type LimitReason = "daily_letters" | "chat_turns" | "monthly_gifts" | "full_moon_only"

export type ChatEvent =
  | { type: "letter"; letterId: string }
  | { type: "text"; delta: string }
  // A sub-agent or tool started or finished; `label` is the status line, e.g. "Looking for gift ideas…".
  | { type: "tool"; name: string; status: "start" | "done" | "error"; label: string }
  | { type: "templates"; ids: TemplateId[] }
  | { type: "gifts"; ideas: GiftIdea[] }
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
