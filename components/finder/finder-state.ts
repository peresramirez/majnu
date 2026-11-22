// What the gift finder shows, as pure reducers: one over the events POST
// /api/finder streams (lib/finder/events.ts), one for wrapping a chosen gift.
// use-finder.ts feeds them; keeping them pure lets every state be tested
// without a browser or a network.
import type {
  FinderContext,
  FinderEvent,
  FinderLimitReason,
  GiftOption,
  WrapResponse,
  WrapTemplateId,
} from "@/lib/finder/events"

export type FinderItem =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string }
  | { id: string; role: "options"; options: GiftOption[]; recommendedId: string; why: string }
  | { id: string; role: "question"; text: string; suggestions: string[] }
  | { id: string; role: "notice"; tone: "limit" | "error"; message: string; reason?: FinderLimitReason; retry?: string }

export type FinderState = {
  sessionId: string | null
  items: FinderItem[]
  streaming: boolean
  // The status line while Majnu works, e.g. "Looking at gifts in Germany…".
  status: string | null
  // Status events since the message was sent; the status moon fills with them.
  steps: number
  // What Majnu assumed (country, language, relationship, age), shown as chips.
  context: FinderContext | null
  // The last message sent, so an error can offer to send it again.
  lastMessage: string | null
  nextId: number
}

export type FinderAction =
  | { type: "send"; text: string }
  | { type: "event"; event: FinderEvent }
  // The request failed before or while streaming (network, HTTP status, sign-in).
  // `reason` adds the matching action, e.g. a sign-in link.
  | { type: "failed"; message: string; reason?: FinderLimitReason }
  // The response body ended.
  | { type: "closed" }
  | { type: "reset" }

// The button and the message it sends share one name, so the visitor sees in
// the conversation exactly what they asked for. The finder agent treats this
// message as the request to ask personalising questions.
export const PERSONALISE_MESSAGE = "Personalise the gift"

export const DEFAULT_ERROR = "Something went wrong finding gifts. Try again."
export const CUT_OFF = "The reply stopped before it finished. Send your message again to pick up where it left off."

export function initialFinderState(): FinderState {
  return { sessionId: null, items: [], streaming: false, status: null, steps: 0, context: null, lastMessage: null, nextId: 0 }
}

type NewItem = FinderItem extends infer T ? (T extends FinderItem ? Omit<T, "id"> : never) : never

function push(state: FinderState, item: NewItem): FinderState {
  return { ...state, items: [...state.items, { ...item, id: `f${state.nextId}` } as FinderItem], nextId: state.nextId + 1 }
}

function appendText(state: FinderState, delta: string): FinderState {
  const last = state.items[state.items.length - 1]
  if (last?.role === "assistant") {
    const items = state.items.slice()
    items[items.length - 1] = { ...last, text: last.text + delta }
    return { ...state, items }
  }
  // Text after cards or a question starts a new paragraph below them.
  const text = delta.replace(/^\s+/, "")
  return text ? push(state, { role: "assistant", text }) : state
}

function applyEvent(state: FinderState, event: FinderEvent): FinderState {
  switch (event.type) {
    case "session":
      return { ...state, sessionId: event.sessionId }
    case "text":
      return appendText(state, event.delta)
    case "status":
      return { ...state, status: event.label, steps: state.steps + 1 }
    case "context":
      return { ...state, context: event.context }
    case "options":
      return push(state, { role: "options", options: event.options, recommendedId: event.recommendedId, why: event.why })
    case "question":
      return push(state, { role: "question", text: event.text, suggestions: event.suggestions ?? [] })
    case "limit":
      return push(state, { role: "notice", tone: "limit", message: event.message, reason: event.reason })
    case "error":
      return push(state, {
        role: "notice",
        tone: "error",
        message: event.message || DEFAULT_ERROR,
        retry: state.lastMessage ?? undefined,
      })
    case "done":
      return { ...state, streaming: false, status: null }
  }
}

export function finderReducer(state: FinderState, action: FinderAction): FinderState {
  switch (action.type) {
    case "send": {
      const next = push(state, { role: "user", text: action.text })
      return { ...next, streaming: true, status: null, steps: 0, lastMessage: action.text }
    }
    case "event":
      return applyEvent(state, action.event)
    case "failed": {
      const next = push(state, {
        role: "notice",
        tone: "error",
        message: action.message,
        reason: action.reason,
        retry: action.reason ? undefined : (state.lastMessage ?? undefined),
      })
      return { ...next, streaming: false, status: null }
    }
    case "closed": {
      if (!state.streaming) return state
      // The stream ended without `done`: say so, unless a notice already did.
      const last = state.items[state.items.length - 1]
      const next = last?.role === "notice" ? state : push(state, { role: "notice", tone: "error", message: CUT_OFF, retry: state.lastMessage ?? undefined })
      return { ...next, streaming: false, status: null }
    }
    case "reset":
      return initialFinderState()
  }
}

// The index of the newest options item: only that one offers "Personalise the gift".
export function latestOptionsIndex(items: FinderItem[]): number {
  for (let i = items.length - 1; i >= 0; i--) if (items[i].role === "options") return i
  return -1
}

// How full the status moon is: a crescent when a reply starts, fuller with each
// step, and full once the options have arrived.
export function statusLit(state: Pick<FinderState, "steps" | "streaming" | "items">): number {
  const last = state.items[state.items.length - 1]
  if (!state.streaming && last?.role === "options") return 1
  return Math.min(0.85, 0.18 + state.steps * 0.2)
}

// --- Wrapping a chosen gift ---------------------------------------------------

// The templates that fit a gift, in the order they are offered: the gift
// templates first (the 3D gift box, and the party pop box for birthdays and
// celebrations), then the letters that carry one. The first is chosen at the
// start. POST /api/finder/wrap accepts exactly these (WRAP_TEMPLATE_IDS).
export const WRAP_TEMPLATES: readonly WrapTemplateId[] = ["gift-reveal", "gift-box-3d", "party-box", "classic-envelope", "postcard"]

export type WrapDetails = { recipientName: string; senderName: string; note: string }

// Whose gift it is once wrapped: a guest (anonymous account, the gift lives in
// this browser until they sign up) or a member (it is in My gifts). No user at
// all reads as a guest, the finder's starting point.
export type WrapAccount = "guest" | "member"

export function wrapAccount(user: { is_anonymous?: boolean } | null | undefined): WrapAccount {
  return user && user.is_anonymous !== true ? "member" : "guest"
}

export type WrapState =
  | { stage: "closed" }
  | { stage: "choose"; option: GiftOption; templateId: WrapTemplateId; error?: string; reason?: FinderLimitReason }
  | { stage: "wrapping"; option: GiftOption; templateId: WrapTemplateId }
  | { stage: "ready"; option: GiftOption; templateId: WrapTemplateId; letterId: string; slug: string }

export type WrapAction =
  | { type: "choose"; option: GiftOption }
  | { type: "template"; templateId: WrapTemplateId }
  | { type: "submit" }
  | { type: "result"; response: WrapResponse }
  | { type: "failed"; message: string }
  | { type: "back" }

export const WRAP_ERROR = "Something went wrong wrapping the gift. Try again."

export function wrapReducer(state: WrapState, action: WrapAction): WrapState {
  switch (action.type) {
    case "choose":
      return { stage: "choose", option: action.option, templateId: WRAP_TEMPLATES[0] }
    case "template":
      return state.stage === "choose" ? { stage: "choose", option: state.option, templateId: action.templateId } : state
    case "submit":
      return state.stage === "choose" ? { stage: "wrapping", option: state.option, templateId: state.templateId } : state
    case "result": {
      if (state.stage !== "wrapping") return state
      const r = action.response
      if ("letterId" in r && r.letterId && r.slug) {
        return { stage: "ready", option: state.option, templateId: state.templateId, letterId: r.letterId, slug: r.slug }
      }
      const error = "error" in r && r.error ? r.error : WRAP_ERROR
      return { stage: "choose", option: state.option, templateId: state.templateId, error, reason: "reason" in r ? r.reason : undefined }
    }
    case "failed":
      return state.stage === "wrapping"
        ? { stage: "choose", option: state.option, templateId: state.templateId, error: action.message }
        : state
    case "back":
      return { stage: "closed" }
  }
}
