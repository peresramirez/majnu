// The gift finder agent (issue #31, docs/plan.md "Gift finder"). The visitor
// says who the gift is for; Majnu assumes the rest (relationship, an age range,
// the place and currency from the network), shows those assumptions, searches,
// and shows three options with one recommended. Asked to personalise, it asks
// up to three questions with tappable answers and searches again.
//
// A short loop of its own on client.beta.messages.stream(), like the main agent
// (lib/agents/main.ts), with two tools:
// - find_gifts: the model's assumptions come in as the tool input; the server
//   fills in default age ranges, checks the limits, and runs the research
//   sub-agent (lib/agents/research.ts) in the visitor's language and country;
// - ask_questions: the personalising questions.
// Both end the turn: the visitor's next move is to look at the options or tap
// an answer, so no closing request is spent on a sentence they would skip.
//
// The conversation is stored exactly as the API returned it and replayed
// append-only (lib/finder/sessions.ts); the system prompt and the tools are
// byte-stable, and per-request facts go in a <context> block in each user turn.
import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import type {
  BetaContentBlock,
  BetaMessageParam,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta"
import * as z from "zod/v4"
import { AGENT_EFFORT, agentRequestBase, getClient } from "@/lib/agents/client"
import { CONTEXT_TAG, describeToday } from "@/lib/agents/context"
import { describeError } from "@/lib/agents/errors"
import { echoableContent } from "@/lib/agents/history"
import { ResearchRefusal, researchGiftReport, type ResearchReport } from "@/lib/agents/research"
import {
  baseLanguage,
  cleanAgeRange,
  defaultAgeRange,
  placeName,
  RELATIONSHIP_KINDS,
  type BaseContext,
  type RelationshipKind,
} from "./context"
import type { FinderContext, FinderEvent, GiftOption } from "./events"
import { canSearch, claimSearch, releaseSearch } from "./limits"
import { textsFor } from "./messages"
import type { StoredOptions } from "./sessions"

// Model requests per visitor message, not counting the research sub-agent's own
// (at most 4): enough to retry a tool call the model got wrong once.
export const MAX_FINDER_REQUESTS = 3
const MAX_TOKENS = 8192
export const OPTIONS_PER_SEARCH = 3
const MAX_QUESTIONS = 3
const MAX_SUGGESTIONS = 4

// Byte-stable: no dates or per-visitor text. Those arrive in the <context> block.
export const FINDER_SYSTEM_PROMPT = `You are Majnu. You help one person, the visitor, find the right gift for someone they love. You talk with them in a small chat on their phone.

How you talk
- Like a thoughtful friend: short sentences, plain words, sentence case. One or two sentences at a time.
- Plain text only: no lists, headings, bold, links or emoji, and no exclamation marks. Never use the words "magic", "AI-powered" or "unlock".
- Reply in the language the visitor writes in. If you can't tell, use their browser language from the context block. In languages with a formal and an informal you, use the informal one (in German du, never Sie).

The context block
- Each visitor message starts with a <context> block from the app: today's date, the visitor's browser language, the country and region their connection comes from, and the local currency. The visitor did not write it and does not see it. Use it, but don't mention it unless they ask how you know where they are.

Finding gifts
- As soon as you know who the gift is for, call find_gifts. Don't ask questions first: assume what you need and let the visitor correct you. The app shows your assumptions as small chips they can correct.
- relationship is who the person is to the visitor, in the visitor's own words. kind is the closest of the listed kinds.
- Fill in every field the visitor has told you about, in this message or an earlier one: age, name, occasion, budget, interests, and senderAge for their own age. The chips show only these fields, so a fact you put only in about is one the visitor can't see or correct. "She turns 62" is age 62 to 62; "around 50 euros" is the budget.
- Use null (for interests, an empty list) when the visitor hasn't said it, and never invent anything. Without an age, the app assumes a range from the relationship.
- about carries everything you know about the person and the occasion, including what is already in the other fields, for the researcher, who sees nothing else.
- status is a few words in the visitor's language for the line the app shows while you search, such as "Looking at gifts in Berlin…".
- The visitor then sees three options and the one you recommend, with why. Don't list or repeat them.
- If the visitor corrects an assumption ("she's 60, not 45") or adds something that changes the choice, call find_gifts again with everything you now know.

Personalising
- When the visitor asks to personalise the gift, or says none of the options fit, call ask_questions with one to three short questions that would change the choice most, such as their name or exact age, what they love or do in their free time, or their job. Give each question two to four short answers the visitor can tap. Then wait for the answers.
- When the visitor answers, call find_gifts again with everything you now know.

After the options
- When the visitor likes an option, tell them in a sentence that they can choose it to wrap it in a gift page and send it as a link.
- If a tool result says a daily limit was reached, the visitor has already seen a note about it. Help them with the options they have instead of searching again.

Rules
- Never invent products, prices, shops or links: only find_gifts finds them.
- Help only with finding a gift. For anything else, say in one sentence that you help find gifts, and ask who it is for.`

// ---------- Tools ----------

// Every field is required, and the ones the visitor may not have given are
// nullable: with optional fields the model left them out and put everything in
// `about` (seen live on 21 November), so the chips never showed an age or a
// budget the visitor had given. A required field makes it decide each one.
const nullable = (schema: Record<string, unknown>, description: string) => ({ anyOf: [schema, { type: "null" }], description })

const FIND_GIFTS_TOOL: BetaTool = {
  name: "find_gifts",
  description:
    "Search the web for three gift options for the person, in the visitor's language and country, with one recommended. The visitor sees your assumptions as chips, then the options. One call per visitor message.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      relationship: {
        type: "string",
        description: "Who the person is to the visitor, in the visitor's own words and language, e.g. 'Mama', 'girlfriend', 'best friend'",
      },
      kind: { type: "string", enum: [...RELATIONSHIP_KINDS], description: "The closest kind of relationship" },
      name: nullable({ type: "string" }, "The person's name if the visitor gave it, otherwise null"),
      age: nullable(
        {
          type: "object",
          properties: { min: { type: "integer" }, max: { type: "integer" } },
          required: ["min", "max"],
          additionalProperties: false,
        },
        "The person's age if the visitor said or clearly implied it, in this or an earlier message, otherwise null. For an exact age ('she turns 62'), give it as both min and max.",
      ),
      senderAge: nullable({ type: "integer" }, "The visitor's own age if they said it, otherwise null"),
      occasion: nullable({ type: "string" }, "e.g. 'Geburtstag', 'Weihnachten', if the visitor said it, otherwise null"),
      budget: nullable({ type: "string" }, "The budget as the visitor said it, e.g. 'etwa 50 €', otherwise null"),
      interests: {
        type: "array",
        items: { type: "string" },
        description: "What the person loves or does, as the visitor said it, a word or two each, e.g. 'Garten', 'Lesen'. Empty if the visitor said nothing about it.",
      },
      about: {
        type: "string",
        description: "Everything you know about the person and the occasion, in one or two sentences, for the gift researcher",
      },
      language: { type: "string", description: "The ISO 639-1 code of the language the visitor writes in, e.g. 'de'" },
      status: {
        type: "string",
        description: "A few words in the visitor's language for the line shown while searching, e.g. 'Ich schaue nach Geschenken in Berlin…'",
      },
    },
    required: ["relationship", "kind", "name", "age", "senderAge", "occasion", "budget", "interests", "about", "language", "status"],
    additionalProperties: false,
  },
}

const ASK_QUESTIONS_TOOL: BetaTool = {
  name: "ask_questions",
  description:
    "Ask the visitor one to three short questions to personalise the gift. Each has two to four short answers the visitor can tap. After this, wait for the answers.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      questions: {
        type: "array",
        description: "One to three questions, the one that matters most first",
        items: {
          type: "object",
          properties: {
            text: { type: "string", description: "The question, short, in the visitor's language" },
            suggestions: { type: "array", items: { type: "string" }, description: "Two to four short answers to tap" },
          },
          required: ["text", "suggestions"],
          additionalProperties: false,
        },
      },
    },
    required: ["questions"],
    additionalProperties: false,
  },
}

// The order and wording never change between requests.
export const FINDER_TOOLS: BetaTool[] = [FIND_GIFTS_TOOL, ASK_QUESTIONS_TOOL]
export const FINDER_TOOL_CHOICE = { type: "auto", disable_parallel_tool_use: true } as const

const shortText = (max: number) => z.string().trim().min(1).transform((s) => s.slice(0, max))

export const FindGiftsInput = z.object({
  relationship: shortText(80),
  kind: z.enum(RELATIONSHIP_KINDS).catch("other"),
  name: shortText(60).optional().catch(undefined),
  age: z.object({ min: z.number(), max: z.number() }).optional().catch(undefined),
  senderAge: z.number().optional().catch(undefined),
  occasion: shortText(80).optional().catch(undefined),
  budget: shortText(60).optional().catch(undefined),
  interests: z
    .array(z.string())
    .transform((items) => items.map((item) => item.trim().slice(0, 60)).filter(Boolean).slice(0, 8))
    .optional()
    .catch(undefined),
  about: shortText(1000),
  language: z.string().optional().catch(undefined),
  status: shortText(100).optional().catch(undefined),
})
export type FindGiftsInput = z.infer<typeof FindGiftsInput>

// The tool's "not given" is null; the schema's is a missing field.
function withoutNulls(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== null))
}

const AskQuestionsInput = z.object({
  questions: z
    .array(
      z.object({
        text: shortText(200),
        suggestions: z
          .array(z.string())
          .transform((items) => items.map((item) => item.trim().slice(0, 60)).filter(Boolean).slice(0, MAX_SUGGESTIONS))
          .catch([]),
      }),
    )
    .min(1)
    .transform((questions) => questions.slice(0, MAX_QUESTIONS)),
})

// ---------- State ----------

export type FinderTurnState = {
  sessionId: string
  ownerId: string
  now: Date
  timezone: string
  // Where the visitor is and their browser language, from the request.
  base: BaseContext
  // The browser's own tag, e.g. "de-DE", for the context block.
  browserLanguage: string
  // What Majnu assumed so far; updated by each search.
  context: FinderContext
  // The options last shown; set by each search. A search in a session that has
  // already shown options is a personalised one.
  lastOptions: StoredOptions | null
  emit: (event: FinderEvent) => void
}

export type FinderTurnResult = {
  // Messages to append to the stored conversation, exactly as sent to and
  // returned by the API. Save them only if they contain an assistant message.
  appended: BetaMessageParam[]
  outcome: "done" | "refusal" | "error"
}

// ---------- Context ----------

export function contextBlockText(state: Pick<FinderTurnState, "now" | "timezone" | "base" | "browserLanguage">): string {
  const place = placeName(state.base)
  return [
    `${CONTEXT_TAG}${describeToday(state.timezone, state.now)}`,
    `Browser language: ${state.browserLanguage}.`,
    `Connection from: ${place ? `${place} (${state.base.country})` : "unknown"}.`,
    state.base.currency ? `Local currency: ${state.base.currency}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
    .concat("</context>")
}

// What Majnu assumed for this search: the place and currency from the request,
// the rest from the model, with a default age range when the visitor gave none.
export function contextFor(base: BaseContext, input: FindGiftsInput): FinderContext {
  const ageRange = cleanAgeRange(input.age) ?? defaultAgeRange(input.kind, input.senderAge)
  return {
    ...base,
    language: baseLanguage(input.language) ?? base.language,
    relationship: input.relationship,
    ...(ageRange ? { ageRange } : {}),
    ...(input.budget ? { budget: input.budget } : {}),
    ...(input.interests && input.interests.length > 0 ? { interests: input.interests } : {}),
  }
}

const KIND_WORDS: Record<RelationshipKind, string> = {
  partner: "the visitor's partner",
  parent: "the visitor's mother or father",
  grandparent: "the visitor's grandparent",
  sibling: "the visitor's brother or sister",
  friend: "the visitor's friend",
  child: "the visitor's child",
  colleague: "the visitor's colleague",
  other: "someone the visitor knows",
}

// The researcher's "Who it is for" line. Assumed ages are marked as assumed, so
// the researcher does not narrow the search more than the visitor did.
export function recipientBrief(input: FindGiftsInput, context: FinderContext): string {
  const parts = [`${input.relationship} (${KIND_WORDS[input.kind]})${input.name ? `, named ${input.name}` : ""}`]
  const given = cleanAgeRange(input.age)
  if (given) parts.push(given[0] === given[1] ? `${given[0]} years old` : `${given[0]} to ${given[1]} years old`)
  else if (context.ageRange) parts.push(`probably about ${context.ageRange[0]} to ${context.ageRange[1]} years old (assumed)`)
  if (input.interests?.length) parts.push(`loves ${input.interests.join(", ")}`)
  return `${parts.join(", ")}. ${input.about}`
}

// ---------- Options ----------

function randomId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10)
}

// Up to three options with a link (the finder shows nothing it cannot link to),
// always including the one the researcher recommends. Null when none has a link.
export function toOptions(report: ResearchReport, makeId: () => string = randomId): StoredOptions | null {
  const linked = report.ideas.map((idea, index) => ({ idea, index })).filter(({ idea }) => idea.url)
  if (linked.length === 0) return null
  let kept = linked.slice(0, OPTIONS_PER_SEARCH)
  const recommended = linked.find(({ index }) => index === report.recommended)
  if (recommended && !kept.includes(recommended)) kept = [...kept.slice(0, OPTIONS_PER_SEARCH - 1), recommended]

  const options: GiftOption[] = kept.map(({ idea }) => ({
    id: makeId(),
    title: idea.title,
    description: idea.description ?? idea.reason,
    reason: idea.reason,
    ...(idea.price ? { price: idea.price } : {}),
    url: idea.url!,
    ...(idea.imageUrl ? { imageUrl: idea.imageUrl } : {}),
    ...(idea.shop ? { shop: idea.shop } : {}),
  }))
  const pick = Math.max(0, kept.findIndex(({ index }) => index === report.recommended))
  return { options, recommendedId: options[pick].id, why: report.why || options[pick].reason }
}

// What the finder model sees of a search: enough to talk about the options
// later ("the second one"), not the search results.
function optionsSummary(shown: StoredOptions): string {
  return JSON.stringify({
    shown: shown.options.map(({ id, title, price, shop }) => ({ id, title, ...(price ? { price } : {}), ...(shop ? { shop } : {}) })),
    recommendedId: shown.recommendedId,
    note: "The visitor sees these options as cards, with your recommendation and why. Don't list them again.",
  })
}

// ---------- Running the tools ----------

type CallOutcome = { result: BetaToolResultBlockParam; terminal: boolean }

function result(call: BetaToolUseBlock, content: string, isError = false): BetaToolResultBlockParam {
  return { type: "tool_result", tool_use_id: call.id, content, ...(isError ? { is_error: true } : {}) }
}

function languageOf(state: FinderTurnState): string {
  return state.context.language || state.base.language
}

function failureMessage(error: unknown, language: string): string {
  const errors = textsFor(language).errors
  if (error instanceof ResearchRefusal) return errors.refusal
  if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) return errors.busy
  return errors.generic
}

type TurnFlags = { searched: boolean }

async function findGifts(call: BetaToolUseBlock, state: FinderTurnState, flags: TurnFlags): Promise<CallOutcome> {
  if (flags.searched) {
    return { result: result(call, "Only one search per visitor message. Wait for the visitor's next message.", true), terminal: true }
  }
  const parsed = FindGiftsInput.safeParse(withoutNulls(call.input))
  if (!parsed.success) return { result: result(call, `Invalid input: ${z.prettifyError(parsed.error)}`, true), terminal: false }
  flags.searched = true
  const input = parsed.data
  const context = contextFor(state.base, input)
  const personalised = state.lastOptions !== null

  const claim = await claimSearch({
    ownerId: state.ownerId,
    sessionId: state.sessionId,
    personalised,
    now: state.now,
    language: context.language,
  })
  if (!claim.ok) {
    state.emit({ type: "limit", reason: claim.reason, message: claim.message })
    return {
      result: result(call, `Not searched: ${claim.message} The visitor sees this note. Help them with the options they already have.`),
      terminal: true,
    }
  }

  state.context = context
  state.emit({ type: "context", context })
  state.emit({ type: "status", label: input.status ?? textsFor(context.language).status })

  let report: ResearchReport
  try {
    report = await researchGiftReport({
      recipient: recipientBrief(input, context),
      occasion: input.occasion ?? "not given",
      budget: input.budget,
      country: placeName(context),
      countryCode: context.country,
      currency: context.currency,
      language: context.language,
      ideas: OPTIONS_PER_SEARCH,
      images: true,
      now: state.now,
      timezone: state.timezone,
    })
  } catch (error) {
    await releaseSearch(claim.claimId)
    console.error("[finder] research failed", describeError(error))
    state.emit({ type: "error", message: failureMessage(error, context.language) })
    return {
      result: result(call, "The search failed, so the visitor saw no options. If they ask, offer to search again.", true),
      terminal: true,
    }
  }

  const shown = toOptions(report)
  if (!shown) {
    // Nothing the visitor could open: the search does not count against them.
    await releaseSearch(claim.claimId)
    state.emit({ type: "error", message: textsFor(context.language).errors.noOptions })
    return {
      result: result(call, "The search found nothing with a link the visitor could open. Ask them for a little more about the person."),
      terminal: true,
    }
  }
  state.lastOptions = shown
  state.emit({ type: "options", options: shown.options, recommendedId: shown.recommendedId, why: shown.why })
  return { result: result(call, optionsSummary(shown)), terminal: true }
}

async function askQuestions(call: BetaToolUseBlock, state: FinderTurnState): Promise<CallOutcome> {
  const parsed = AskQuestionsInput.safeParse(call.input)
  if (!parsed.success) return { result: result(call, `Invalid input: ${z.prettifyError(parsed.error)}`, true), terminal: false }

  // The answers lead to another search: don't ask if it would be refused.
  const language = languageOf(state)
  const allowed = await canSearch(state.ownerId, state.lastOptions !== null, state.now, language)
  if (!allowed.ok) {
    state.emit({ type: "limit", reason: allowed.reason, message: allowed.message })
    return {
      result: result(call, `Not asked: ${allowed.message} The visitor sees this note. Help them with the options they already have.`),
      terminal: true,
    }
  }
  for (const question of parsed.data.questions) {
    state.emit({ type: "question", text: question.text, ...(question.suggestions.length ? { suggestions: question.suggestions } : {}) })
  }
  return { result: result(call, "The visitor sees the questions with answers to tap. Wait for their answers."), terminal: true }
}

async function runCall(call: BetaToolUseBlock, state: FinderTurnState, flags: TurnFlags): Promise<CallOutcome> {
  try {
    if (call.name === FIND_GIFTS_TOOL.name) return await findGifts(call, state, flags)
    if (call.name === ASK_QUESTIONS_TOOL.name) return await askQuestions(call, state)
    return { result: result(call, `There is no tool called ${call.name}.`, true), terminal: false }
  } catch (error) {
    // A limit check or the database failed. The call still needs a result.
    console.error("[finder] tool failed", call.name, describeError(error))
    state.emit({ type: "error", message: textsFor(languageOf(state)).errors.generic })
    return { result: result(call, "It failed for a technical reason. If the visitor asks, offer to try again.", true), terminal: true }
  }
}

// ---------- The loop ----------

function userTurn(message: string, state: FinderTurnState): BetaMessageParam {
  return {
    role: "user",
    content: [
      { type: "text", text: contextBlockText(state) },
      { type: "text", text: message },
    ],
  }
}

function toolUses(content: BetaContentBlock[]): BetaToolUseBlock[] {
  return content.filter((block): block is BetaToolUseBlock => block.type === "tool_use")
}

export async function runFinderTurn(opts: {
  history: BetaMessageParam[]
  message: string
  state: FinderTurnState
}): Promise<FinderTurnResult> {
  const { history, state } = opts
  const appended: BetaMessageParam[] = [userTurn(opts.message, state)]
  const flags: TurnFlags = { searched: false }
  let wroteText = false
  let lastBlockWasText = false

  try {
    for (let request = 0; request < MAX_FINDER_REQUESTS; request++) {
      const stream = getClient().beta.messages.stream({
        ...agentRequestBase(),
        max_tokens: MAX_TOKENS,
        system: FINDER_SYSTEM_PROMPT,
        tools: FINDER_TOOLS,
        // At most one tool call per reply: one search per message, and a
        // search and questions never in the same reply. `auto` is the only
        // tool_choice current models accept; this flag still works with it.
        tool_choice: FINDER_TOOL_CHOICE,
        output_config: { effort: AGENT_EFFORT },
        // Caches the prefix for the next request and the next message.
        cache_control: { type: "ephemeral" },
        messages: [...history, ...appended],
      })

      let separatorPending = false
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          if (event.content_block.type === "text") separatorPending = wroteText && !lastBlockWasText
          lastBlockWasText = event.content_block.type === "text"
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
          if (separatorPending) {
            state.emit({ type: "text", delta: "\n\n" })
            separatorPending = false
          }
          state.emit({ type: "text", delta: event.delta.text })
          wroteText = true
        }
      }
      const reply = await stream.finalMessage()
      lastBlockWasText = false

      if (reply.stop_reason === "refusal") {
        // Every model in the fallback chain declined. The reply is not kept.
        state.emit({ type: "error", message: textsFor(languageOf(state)).errors.refusal })
        return { appended, outcome: "refusal" }
      }

      const content = echoableContent(reply.content)
      appended.push({ role: "assistant", content })
      if (reply.stop_reason === "pause_turn") continue

      const calls = toolUses(content)
      if (calls.length === 0) return { appended, outcome: "done" }

      if (reply.stop_reason !== "tool_use") {
        // Cut off at max_tokens mid-call: nothing runs, but every call needs a result.
        appended.push({
          role: "user",
          content: calls.map((call) => result(call, "The call was cut off before it was complete, so it did not run. Make it again, shorter.", true)),
        })
        continue
      }

      // One at a time, in order: a search and a question in one reply must not race.
      const results: BetaToolResultBlockParam[] = []
      let terminal = false
      for (const call of calls) {
        const outcome = await runCall(call, state, flags)
        results.push(outcome.result)
        terminal ||= outcome.terminal
      }
      appended.push({ role: "user", content: results })
      if (terminal) return { appended, outcome: "done" }
    }
    return { appended, outcome: "done" }
  } catch (error) {
    console.error("[finder] turn failed", describeError(error))
    const errors = textsFor(languageOf(state)).errors
    const busy = error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError
    state.emit({ type: "error", message: busy ? errors.busy : errors.generic })
    return { appended, outcome: "error" }
  }
}
