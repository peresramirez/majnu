// What the create chat shows, as a pure reducer over the events POST /api/chat
// streams (lib/agents/events.ts). use-letter-chat.ts feeds it; keeping it pure
// lets the event handling be tested without a browser or a network.
import type { ChatEvent, DisplayMessage, GiftIdea, LimitReason } from "@/lib/agents/events"
import type { LetterKind, TemplateId } from "@/lib/letters/schema"

export type ChatItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; templates?: TemplateId[]; gifts?: GiftIdea[] }
  | { id: string; role: "notice"; tone: "limit" | "refusal" | "error"; message: string; reason?: LimitReason }

export type ChatState = {
  letterId: string | null
  items: ChatItem[]
  streaming: boolean
  // The status line while a tool runs, e.g. "Looking for gift ideas…".
  status: string | null
  // Goes up by one on every `preview` event; the preview iframe is keyed on it.
  previewVersion: number
  hasContent: boolean
  kind: LetterKind | null
  templateId: TemplateId | null
  // Streamed text may extend the last assistant item only if its index is at
  // least this. Moved past the end after cards, so text that follows cards
  // appears below them instead of above.
  appendFrom: number
  // A tool ran since the last text, so the next text starts a new paragraph.
  breakBeforeText: boolean
  nextId: number
}

export type ChatInit = {
  letterId?: string | null
  messages?: DisplayMessage[]
  hasContent?: boolean
  kind?: LetterKind | null
  templateId?: TemplateId | null
}

export type ChatAction =
  | { type: "send"; text: string }
  | { type: "event"; event: ChatEvent }
  // The request failed before or while streaming (network, HTTP status).
  | { type: "failed"; message: string }
  // The response body ended.
  | { type: "closed" }

export const DEFAULT_REFUSAL = "Majnu can't help with that one. Try asking another way."
export const DEFAULT_ERROR = "Something went wrong writing the reply. Try again."
export const CUT_OFF = "The reply stopped before it finished. Send your message again to pick up where it left off."

// The message a template choice sends, as docs/plan.md specifies, so the main
// agent always sees the choice in the conversation.
export function templateMessage(templateName: string): string {
  return `Use the "${templateName}" template.`
}

// What the composer sends: the template sentence (if one is attached) followed
// by what the person typed.
export function composeMessage(templateName: string | null, typed: string): string {
  const text = typed.trim()
  if (!templateName) return text
  return text ? `${templateMessage(templateName)} ${text}` : templateMessage(templateName)
}

// What frames the chat (issue #62).
//   header: the bar with the gift's name and state, only once a gift exists. A
//     first message refused by the day's letter limit creates none, so the bar
//     does not claim "New gift · In progress".
//   opening: what an empty chat shows. "new" is the new-gift starter ("Who is
//     it for?"); "built" is for a gift that is built but has no conversation,
//     such as one wrapped in the gift finder, and starts from that gift.
//   phoneView: which half a phone shows first. A built gift with no
//     conversation opens on its preview and share panel, because sending it is
//     what the sender came back for.
export type ChatFrame = { header: boolean; opening: "new" | "built" | null; phoneView: "chat" | "preview" }

export function chatFrame(opts: { letterId: string | null; hasContent: boolean; itemCount: number; storedMessages?: number }): ChatFrame {
  const built = opts.letterId !== null && opts.hasContent
  return {
    header: opts.letterId !== null,
    opening: opts.itemCount > 0 ? null : built ? "built" : "new",
    phoneView: built && (opts.storedMessages ?? 0) === 0 ? "preview" : "chat",
  }
}

export function initialChatState(init: ChatInit = {}): ChatState {
  const items: ChatItem[] = (init.messages ?? []).map((m, i) =>
    m.role === "user"
      ? { id: `h${i}`, role: "user", text: m.text }
      : { id: `h${i}`, role: "assistant", text: m.text, templates: m.templates, gifts: m.gifts },
  )
  return {
    letterId: init.letterId ?? null,
    items,
    streaming: false,
    status: null,
    previewVersion: 0,
    hasContent: init.hasContent ?? false,
    kind: init.kind ?? null,
    templateId: init.templateId ?? null,
    appendFrom: items.length,
    breakBeforeText: false,
    nextId: 0,
  }
}

type NewItem = ChatItem extends infer T ? (T extends ChatItem ? Omit<T, "id"> : never) : never

function push(state: ChatState, item: NewItem): ChatState {
  return { ...state, items: [...state.items, { ...item, id: `m${state.nextId}` } as ChatItem], nextId: state.nextId + 1 }
}

// The assistant item of the reply being streamed, if it is still the last item.
function currentAssistantIndex(state: ChatState): number {
  const i = state.items.length - 1
  return i >= state.appendFrom && state.items[i]?.role === "assistant" ? i : -1
}

function updateAssistant(
  state: ChatState,
  update: (item: Extract<ChatItem, { role: "assistant" }>) => Extract<ChatItem, { role: "assistant" }>,
): ChatState {
  let next = state
  let i = currentAssistantIndex(next)
  if (i === -1) {
    next = push(next, { role: "assistant", text: "" })
    i = next.items.length - 1
  }
  const items = next.items.slice()
  items[i] = update(items[i] as Extract<ChatItem, { role: "assistant" }>)
  return { ...next, items }
}

// Cards close the current assistant item: what Majnu says next goes below them.
function seal(state: ChatState): ChatState {
  return { ...state, appendFrom: state.items.length, breakBeforeText: false }
}

function applyEvent(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "letter":
      return { ...state, letterId: event.letterId }
    case "text": {
      if (!event.delta) return state
      const breakBefore = state.breakBeforeText
      return {
        ...updateAssistant(state, (item) => ({
          ...item,
          text: item.text + (breakBefore && item.text && !item.text.endsWith("\n") ? "\n\n" : "") + event.delta,
        })),
        breakBeforeText: false,
      }
    }
    case "tool":
      return { ...state, status: event.status === "start" ? event.label : null, breakBeforeText: true }
    case "templates":
      return event.ids.length ? seal(updateAssistant(state, (item) => ({ ...item, templates: event.ids }))) : state
    case "gifts":
      return event.ideas.length ? seal(updateAssistant(state, (item) => ({ ...item, gifts: event.ideas }))) : state
    case "preview":
      return {
        ...state,
        letterId: event.letterId,
        hasContent: true,
        kind: event.kind,
        templateId: event.templateId,
        previewVersion: state.previewVersion + 1,
      }
    case "limit":
      return { ...push(state, { role: "notice", tone: "limit", message: event.message, reason: event.reason }), status: null }
    case "refusal":
      return { ...push(state, { role: "notice", tone: "refusal", message: event.message || DEFAULT_REFUSAL }), status: null }
    case "error":
      return { ...push(state, { role: "notice", tone: "error", message: event.message || DEFAULT_ERROR }), status: null }
    case "done":
      return { ...state, streaming: false, status: null }
    default:
      return state
  }
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "send": {
      const next = push(state, { role: "user", text: action.text })
      return { ...next, streaming: true, status: null, appendFrom: next.items.length, breakBeforeText: false }
    }
    case "event":
      return applyEvent(state, action.event)
    case "failed":
      return { ...push(state, { role: "notice", tone: "error", message: action.message }), streaming: false, status: null }
    case "closed":
      // After `done` this changes nothing. Without it, the reply was cut off.
      if (!state.streaming) return state
      return { ...push(state, { role: "notice", tone: "error", message: CUT_OFF }), streaming: false, status: null }
    default:
      return state
  }
}
