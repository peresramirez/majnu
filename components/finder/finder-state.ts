// What the gift finder shows, as pure reducers: one over the events POST
// /api/finder streams (lib/finder/events.ts), one for wrapping a chosen gift.
// use-finder.ts feeds them; keeping them pure lets every state be tested
// without a browser or a network.
import type {
  FinderContext,
  FinderEvent,
  FinderLimitReason,
  GiftOption,
  WrapChoice,
  WrapFill,
  WrapRequest,
  WrapResponse,
  WrapTemplateId,
} from "@/lib/finder/events"
import { WRAP_ORDER } from "@/lib/finder/wrap-templates"

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
    case "fill":
      // For the wrap form (wrapReducer); the conversation shows Majnu's words.
      return state
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

// What the finder's one polite live region says when a reply finishes (the
// dialog and the inline panel both have it). An error notice is left out: it
// is its own alert (role="alert" in conversation.tsx), so it is heard once. A
// limit notice is not a live region itself, so it is heard here, once.
export function finderAnnouncement(items: FinderItem[]): string {
  const last = items[items.length - 1]
  if (!last) return ""
  if (last.role === "options") return `${last.options.length} gift ideas are ready.`
  if (last.role === "question") return `Majnu asks: ${last.text}`
  if (last.role === "notice") return last.tone === "error" ? "" : last.message
  if (last.role === "assistant") return "Majnu replied."
  return ""
}

// The live role a notice in the conversation takes: an error interrupts as an
// alert; a limit has none, because finderAnnouncement() reads it out.
export function noticeRole(item: Extract<FinderItem, { role: "notice" }>): "alert" | undefined {
  return item.tone === "error" ? "alert" : undefined
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
// parties), then the letters that carry one. The first is chosen at the
// start. POST /api/finder/wrap accepts exactly these (WRAP_TEMPLATE_IDS).
// The wrap step shows wrapTemplatesFor(context): the party pop box only when
// the occasion Majnu heard is a birthday or a party (issue #59).
export const WRAP_TEMPLATES: readonly WrapTemplateId[] = WRAP_ORDER

// What the sender fills in on the wrap step's second page. Only their name is
// required; POST /api/finder/wrap still accepts a request without one.
export type WrapDetails = { recipientName: string; senderName: string; note: string; giftCode: string }

// The wrap form's limits, the same as POST /api/finder/wrap and fill_wrap.
export const WRAP_LIMITS = { recipientName: 60, senderName: 60, note: 600, giftCode: 200 } as const

export const EMPTY_DETAILS: WrapDetails = { recipientName: "", senderName: "", note: "", giftCode: "" }

// Whose gift it is once wrapped: a guest (anonymous account, the gift lives in
// this browser until they sign up) or a member (it is in My gifts). No user at
// all reads as a guest, the finder's starting point.
export type WrapAccount = "guest" | "member"

export function wrapAccount(user: { is_anonymous?: boolean } | null | undefined): WrapAccount {
  return user && user.is_anonymous !== true ? "member" : "guest"
}

// Wrapping takes two steps (issue #71): 1. the design, then Next; 2. the
// details, with the Wrap button. Back on step 2 returns to step 1 and keeps
// what was typed. `from` is where the conversation stood when the wrap step
// opened: what is said after it is shown on the wrap step.
export type WrapStep = "design" | "details"

type OpenParts = { option: GiftOption; templateId: WrapTemplateId; details: WrapDetails; from: number }

export type WrapState =
  | { stage: "closed" }
  | (OpenParts & {
      stage: "choose"
      step: WrapStep
      error?: string
      reason?: FinderLimitReason
      // Wrap was pressed without their name.
      nameMissing?: boolean
      // Majnu filled in fields from a message (fill_wrap), for the sender to check.
      filled?: (keyof WrapDetails)[]
    })
  | (OpenParts & { stage: "wrapping" })
  | (OpenParts & { stage: "ready"; letterId: string; slug: string })

export type WrapAction =
  // `recipientName` prefills "Their name" when the visitor told Majnu a name.
  | { type: "choose"; option: GiftOption; recipientName?: string; from?: number }
  | { type: "template"; templateId: WrapTemplateId }
  | { type: "next" }
  | { type: "previous" }
  | { type: "details"; details: Partial<WrapDetails> }
  | { type: "fill"; fields: WrapFill }
  // A new search showed other options: the chosen one may be gone.
  | { type: "options" }
  | { type: "submit" }
  | { type: "result"; response: WrapResponse }
  | { type: "failed"; message: string }
  | { type: "back" }

export const WRAP_ERROR = "Something went wrong wrapping the gift. Try again."

export const NAME_REQUIRED = "Write their name first. It goes on the page."

function clip(details: WrapDetails): WrapDetails {
  return {
    recipientName: details.recipientName.slice(0, WRAP_LIMITS.recipientName),
    senderName: details.senderName.slice(0, WRAP_LIMITS.senderName),
    note: details.note.slice(0, WRAP_LIMITS.note),
    giftCode: details.giftCode.slice(0, WRAP_LIMITS.giftCode),
  }
}

function parts(state: Exclude<WrapState, { stage: "closed" }>): OpenParts {
  return { option: state.option, templateId: state.templateId, details: state.details, from: state.from }
}

export function wrapReducer(state: WrapState, action: WrapAction): WrapState {
  switch (action.type) {
    case "choose":
      return {
        stage: "choose",
        step: "design",
        option: action.option,
        templateId: WRAP_TEMPLATES[0],
        details: clip({ ...EMPTY_DETAILS, recipientName: action.recipientName?.trim() ?? "" }),
        from: action.from ?? 0,
      }
    case "template":
      return state.stage === "choose" ? { ...state, templateId: action.templateId } : state
    case "next":
      return state.stage === "choose" ? { ...state, step: "details" } : state
    case "previous":
      return state.stage === "choose" ? { ...state, step: "design" } : state
    case "details": {
      if (state.stage !== "choose") return state
      const details = clip({ ...state.details, ...action.details })
      return { ...state, details, nameMissing: state.nameMissing && !details.recipientName.trim() }
    }
    case "fill": {
      if (state.stage !== "choose") return state
      const keys = (Object.keys(action.fields) as (keyof WrapFill)[]).filter((key) => action.fields[key]?.trim())
      if (keys.length === 0) return state
      const filled = Object.fromEntries(keys.map((key) => [key, action.fields[key]!.trim()]))
      const details = clip({ ...state.details, ...filled })
      return { ...state, step: "details", details, filled: keys, nameMissing: state.nameMissing && !details.recipientName.trim() }
    }
    case "options":
      return state.stage === "choose" ? { stage: "closed" } : state
    case "submit": {
      if (state.stage !== "choose") return state
      if (state.step !== "details") return { ...state, step: "details" }
      if (!state.details.recipientName.trim()) return { ...state, nameMissing: true, error: undefined, reason: undefined }
      return { stage: "wrapping", ...parts(state) }
    }
    case "result": {
      if (state.stage !== "wrapping") return state
      const r = action.response
      if ("letterId" in r && r.letterId && r.slug) {
        return { stage: "ready", ...parts(state), letterId: r.letterId, slug: r.slug }
      }
      const error = "error" in r && r.error ? r.error : WRAP_ERROR
      return { stage: "choose", step: "details", ...parts(state), error, reason: "reason" in r ? r.reason : undefined }
    }
    case "failed":
      return state.stage === "wrapping" ? { stage: "choose", step: "details", ...parts(state), error: action.message } : state
    case "back":
      return { stage: "closed" }
  }
}

// What a message sent from the finder's box carries while the wrap step is
// open: the gift and the design chosen (issue #70). Nothing otherwise.
export function wrapChoice(state: WrapState): WrapChoice | undefined {
  return state.stage === "choose" ? { optionId: state.option.id, templateId: state.templateId } : undefined
}

// The wrap request for the details typed, trimmed, without empty fields.
export function wrapRequest(sessionId: string, state: Pick<OpenParts, "option" | "templateId" | "details">): WrapRequest {
  const trimmed = (value: string) => value.trim() || undefined
  const { recipientName, senderName, note, giftCode } = state.details
  return {
    sessionId,
    optionId: state.option.id,
    templateId: state.templateId,
    recipientName: trimmed(recipientName),
    senderName: trimmed(senderName),
    note: trimmed(note),
    giftCode: trimmed(giftCode),
  }
}

// What was said since the wrap step opened, for the wrap step to show: from
// the visitor's newest message on, so the reply to it stays in view.
export function wrapExchange(items: FinderItem[], from: number): FinderItem[] {
  const since = items.slice(from)
  let lastUser = -1
  for (let i = since.length - 1; i >= 0; i--) {
    if (since[i].role === "user") {
      lastUser = i
      break
    }
  }
  return lastUser === -1 ? [] : since.slice(lastUser).filter((item) => item.role !== "options")
}
