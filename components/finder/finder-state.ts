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
  // `files`: photos and documents sent with it (issue #77), as shown.
  // `filesRefused`: the request was refused before any was read.
  | { id: string; role: "user"; text: string; files?: SentFile[]; filesRefused?: boolean }
  | { id: string; role: "assistant"; text: string }
  | { id: string; role: "options"; options: GiftOption[]; recommendedId: string; why: string }
  | { id: string; role: "question"; text: string; suggestions: string[]; label?: string; profileRead?: boolean }
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
  // Issue #82: the answer picked for each question, by item id. Picking sends
  // nothing; all of them go in one message (composeAnswers). Kept after
  // sending, so answered questions show what was picked.
  answers: Record<string, string>
  // The optional profile field under the open questions.
  profile: ProfileAnswer
  // The visitor sent "No public profile": the field is not offered again.
  profileDeclined: boolean
}

export type ProfileAnswer = { link: string; none: boolean }

export type SentFile = { kind: "image" | "pdf" | "text"; name: string }

export type FinderAction =
  // `answered`: the message carries the picked answers and the profile field
  // (composeAnswers). Otherwise the open questions' picks are dropped.
  | { type: "send"; text: string; answered?: boolean; files?: SentFile[] }
  // Picks an answer, or clears it when it is picked again.
  | { type: "answer"; itemId: string; value: string }
  | { type: "profile"; link?: string; none?: boolean }
  | { type: "event"; event: FinderEvent }
  // The request failed before or while streaming (network, HTTP status, sign-in).
  // `reason` adds the matching action, e.g. a sign-in link.
  // `noRetry`: sending the words again would leave the files out.
  | { type: "failed"; message: string; reason?: FinderLimitReason; noRetry?: boolean }
  // The response body ended.
  | { type: "closed" }
  | { type: "reset" }

// The button and the message it sends share one name, so the visitor sees in
// the conversation exactly what they asked for. The finder agent treats this
// message as the request to ask personalising questions.
export const PERSONALISE_MESSAGE = "Personalise the gift"

export const DEFAULT_ERROR = "Something went wrong finding gifts. Try again."
export const CUT_OFF = "The reply stopped before it finished. Send your message again to pick up where it left off."

export const EMPTY_PROFILE: ProfileAnswer = { link: "", none: false }

export function initialFinderState(): FinderState {
  return {
    sessionId: null,
    items: [],
    streaming: false,
    status: null,
    steps: 0,
    context: null,
    lastMessage: null,
    nextId: 0,
    answers: {},
    profile: EMPTY_PROFILE,
    profileDeclined: false,
  }
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
      return push(state, {
        role: "question",
        text: event.text,
        suggestions: event.suggestions ?? [],
        ...(event.label ? { label: event.label } : {}),
        ...(event.profileRead ? { profileRead: true } : {}),
      })
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
      const open = openQuestions(state.items)
      // What was picked for questions this message does not answer is dropped.
      const answers = action.answered ? state.answers : withoutKeys(state.answers, open.map((q) => q.id))
      const declined = state.profileDeclined || (action.answered === true && showsProfileField(state) && state.profile.none)
      const next = push(state, { role: "user", text: action.text, ...(action.files?.length ? { files: action.files } : {}) })
      return { ...next, streaming: true, status: null, steps: 0, lastMessage: action.text, answers, profile: EMPTY_PROFILE, profileDeclined: declined }
    }
    case "answer": {
      const question = openQuestions(state.items).find((q) => q.id === action.itemId)
      if (!question || state.streaming || !question.suggestions.includes(action.value)) return state
      if (state.answers[action.itemId] === action.value) return { ...state, answers: withoutKeys(state.answers, [action.itemId]) }
      return { ...state, answers: { ...state.answers, [action.itemId]: action.value } }
    }
    case "profile": {
      if (action.none !== undefined) return { ...state, profile: action.none ? { link: "", none: true } : { ...state.profile, none: false } }
      const link = (action.link ?? "").slice(0, MAX_PROFILE_LINK)
      return { ...state, profile: { link, none: link.trim() ? false : state.profile.none } }
    }
    case "event":
      return applyEvent(state, action.event)
    case "failed": {
      // Files refused with the request were not read: they leave the search's 6.
      const last = state.items[state.items.length - 1]
      const items =
        last?.role === "user" && last.files?.length ? [...state.items.slice(0, -1), { ...last, filesRefused: true }] : state.items
      const next = push({ ...state, items }, {
        role: "notice",
        tone: "error",
        message: action.message,
        reason: action.reason,
        retry: action.reason || action.noRetry ? undefined : (state.lastMessage ?? undefined),
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

// --- Answering Majnu's questions (issue #82) ---------------------------------

export const NO_PROFILE = "No public profile"
export const PROFILE_FIELD_LABEL = "Their Instagram, TikTok or LinkedIn (optional)"
export const SEND_ANSWERS = "Send answers"
// The message box's placeholder while questions are open.
export const ANSWER_PLACEHOLDER = "Or answer in your own words"
const MAX_PROFILE_LINK = 300

function withoutKeys(record: Record<string, string>, keys: string[]): Record<string, string> {
  if (!keys.some((key) => key in record)) return record
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)))
}

// The questions the visitor can still answer: those after their newest message.
export function openQuestions(items: FinderItem[]): Extract<FinderItem, { role: "question" }>[] {
  let lastUser = -1
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].role === "user") {
      lastUser = i
      break
    }
  }
  return items.slice(lastUser + 1).filter((item): item is Extract<FinderItem, { role: "question" }> => item.role === "question")
}

// Whether the open questions end with the profile field: always, until a
// public profile has been read in this session or the visitor said they have
// none, so Majnu does not have to remember to ask.
export function showsProfileField(state: Pick<FinderState, "items" | "profileDeclined">): boolean {
  const open = openQuestions(state.items)
  return open.length > 0 && !state.profileDeclined && !open.some((q) => q.profileRead)
}

function sentence(text: string): string {
  const trimmed = text.trim()
  return /[.!?…]$/.test(trimmed) ? trimmed : `${trimmed}.`
}

// The one message that answers the open questions: each picked answer, as
// "Free time: video games." (or the question and the answer when Majnu gave
// no label), then the profile field, then what the visitor typed.
export function composeAnswers(state: Pick<FinderState, "items" | "answers" | "profile" | "profileDeclined">, typed: string): string {
  const parts: string[] = []
  for (const question of openQuestions(state.items)) {
    const answer = state.answers[question.id]?.trim()
    if (!answer) continue
    parts.push(question.label ? sentence(`${question.label.trim()}: ${answer}`) : `${question.text.trim()} ${sentence(answer)}`)
  }
  if (showsProfileField(state)) {
    if (state.profile.none) parts.push(`${NO_PROFILE}.`)
    else if (state.profile.link.trim()) parts.push(state.profile.link.trim())
  }
  if (typed.trim()) parts.push(typed.trim())
  return parts.join(" ")
}

// Something to send besides typed words: a picked answer or the profile field.
export function hasAnswers(state: Pick<FinderState, "items" | "answers" | "profile" | "profileDeclined">): boolean {
  return composeAnswers(state, "") !== ""
}

// Files sent so far in this search, so the box can say when its 6 are used.
export function filesSent(items: FinderItem[]): number {
  return items.reduce((count, item) => count + (item.role === "user" && !item.filesRefused ? (item.files?.length ?? 0) : 0), 0)
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
