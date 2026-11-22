// Builder sub-agent (issue #7): one streamed structured-output call that turns
// a brief from the main agent into the content of a letter or calendar,
// validated against the contract in lib/letters/schema.ts. Retries once when
// the output does not fit the template. While it streams, the text goes to an
// optional draft sink, so the create page can show the page being written
// (issue #30, lib/agents/draft.ts); only the validated result is returned.
import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import type { BetaMessageStream } from "@anthropic-ai/sdk/lib/BetaMessageStream"
import { shortName } from "@/lib/letters/names"
import { CalendarContent, LetterContent, type LetterKind, type TemplateId } from "@/lib/letters/schema"
import { getTemplate } from "@/lib/letters/templates"
import { AGENT_EFFORT, agentRequestBase, getClient } from "./client"
import { describeToday, isValidTimezone } from "./context"
import type { DraftSink } from "./draft"
import { httpsOnly } from "./safe-url"

export type BuiltContent =
  | { kind: "letter"; content: LetterContent }
  | { kind: "calendar"; content: CalendarContent }

export type BuildInput = {
  templateId: TemplateId
  now: Date
  // The sender's IANA timezone.
  timezone: string
  // The page is given as a gift, so it must carry one even on a template where
  // a gift is optional (party-box). The finder's wrap step sets it, and so does
  // build_letter when the main agent says the page is a present (givenAsGift).
  giftRequired?: boolean
  // Receives the streamed JSON text for live drafts. Optional: the finder's
  // wrap step builds without one.
  draft?: DraftSink
} & (
  | { mode: "build"; brief: string }
  | { mode: "edit"; current: LetterContent | CalendarContent; change: string }
)

// The model declined to write this content (stop_reason "refusal").
export class BuilderRefusal extends Error {
  constructor() {
    super("The builder declined to write this content")
    this.name = "BuilderRefusal"
  }
}

// The output still did not fit the template after one retry.
export class BuilderInvalidOutput extends Error {
  constructor(readonly problems: string[]) {
    super(`The builder's output did not fit the template: ${problems.join("; ")}`)
    this.name = "BuilderInvalidOutput"
  }
}

// Byte-stable: no dates or per-user text here. They go in the user message.
export const BUILDER_SYSTEM_PROMPT = `You write the content of a personal gift page on Majnu, made by one person (the sender) for one other person (the recipient). The page is a template: a letter, a gift reveal, an invitation, a postcard, an advent calendar or a countdown. You fill its fields as JSON that matches the schema.

Writing
- Write in the language of the sender's own words in the brief (the brief itself may be in English). Keep names exactly as given.
- An early draft may come before the names: if the brief says a name is not known yet, write recipientName the way the sender calls the person ("my sister" becomes "Sister") and leave senderName empty.
- Write as the sender, in the first person, to the recipient. Warm, specific and personal: use the details in the brief. Plain words, short sentences, nothing generic or flowery.
- Use the sender's own phrases where they gave them. Do not invent memories or facts about their lives. When the brief is thin, stay simple and sincere rather than making things up.
- No exclamation marks unless the sender used them. No emoji unless the sender asked.
- headline: under 60 characters. body: 1 to 6 short paragraphs; for a gift reveal, an invitation or a postcard, 1 or 2.
- occasion: a short label such as "Birthday", "Wedding", "Thank you", "Just because".
- theme: the palette and font that suit the occasion and the template, unless the sender asked for something.

Gifts
- Include only gifts the brief names. Copy codes, links and prices exactly, character for character. Never invent a code, a link, a price or an image.
- Links must start with https://. Leave out any link that does not.
- A gift reveal, a 3D gift box or a 3D gift tin (gift-reveal, gift-box-3d, gift-3d) needs at least one gift. A party pop box (party-box) needs one when the brief gives a gift. Other letters usually have none: an empty list.

Invitations (wedding-invite, party-invite, wedding-envelope-3d, wedding-invite-3d, party-invite-3d)
- Fill event: a title, startsAt as local ISO 8601 with the UTC offset that applies on that date in that timezone (for example 2026-12-24T19:00:00+01:00), locationName, and a street address a map can find.
- Use the date, time and place from the brief. If the time is missing, pick a sensible one for the occasion.
- recipientName may be a group ("Everyone", "Friends") when the invitation is for several people.
- A party pop box (party-box) is an invitation only when the brief gives a party's date and place: then fill event the same way. Otherwise leave event out.

Calendars
- advent-classic: exactly 24 doors, days 1 to 24. startDate is 1 December of this year, or of next year if this year's Christmas has passed, unless the brief says otherwise.
- countdown: 1 to 31 doors, one per day. Door N opens on startDate + (N - 1) days. Unless the brief says otherwise, the last door opens on the big day itself, so work startDate back from that date and the number of days.
- Door titles are short. Each message is one to three sentences and different from the others: memories, small plans, encouragement, little dares. Build towards the last door.
- Put a gift on a door only when the brief names it for that door or day.
- timezone: the recipient's IANA timezone if the brief gives it, otherwise the sender's.

Editing
- When you are given the current content and a change, apply the change and keep everything else exactly as it is, unless the change requires otherwise. Return the whole content.`

const MAX_TOKENS = 16000

const CUT_OFF = "the answer was cut off; keep the messages shorter"

// The gift list on an invitation (issue #35) is written only by the
// update_gift_list tool, which gives each gift a stable id that guests' claims
// refer to. The builder neither sees nor writes it, so it cannot drop, rename
// or invent gifts; the main agent's tools carry it over after a build or an edit.
export const BuilderLetterContent = LetterContent.omit({ wishlist: true })

function schemaFor(kind: LetterKind) {
  return kind === "calendar" ? CalendarContent : BuilderLetterContent
}

// What the builder is shown of the current content when editing: everything but the gift list.
export function contentForBuilder(content: LetterContent | CalendarContent): LetterContent | CalendarContent {
  if (!("wishlist" in content)) return content
  const { wishlist, ...rest } = content
  void wishlist
  return rest
}

function userPrompt(input: BuildInput, problems: string[] | null): string {
  const template = getTemplate(input.templateId)
  const lines = [
    describeToday(input.timezone, input.now) + ` The sender's timezone is ${input.timezone}.`,
    `Template: ${input.templateId} ("${template?.name ?? input.templateId}"). ${template?.description ?? ""}`,
    "",
  ]
  if (input.mode === "build") {
    lines.push("Brief from the conversation with the sender:", "<brief>", input.brief, "</brief>")
  } else {
    lines.push(
      "Current content:",
      "<current>",
      JSON.stringify(contentForBuilder(input.current)),
      "</current>",
      "",
      "The change the sender asked for:",
      "<change>",
      input.change,
      "</change>",
    )
  }
  if (problems) {
    lines.push("", `Your previous answer could not be used: ${problems.join("; ")}. Fix this and answer again.`)
  }
  return lines.join("\n")
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

type GiftLike = { url?: string; imageUrl?: string }

// A link that is not https could run script in a template, so it never leaves here.
function sanitizeGift<T extends GiftLike>(gift: T): T {
  const { url, imageUrl, ...rest } = gift
  const safeUrl = httpsOnly(url)
  const safeImage = httpsOnly(imageUrl)
  return { ...rest, ...(safeUrl ? { url: safeUrl } : {}), ...(safeImage ? { imageUrl: safeImage } : {}) } as T
}

// Templates whose page is built around the event: without it there is nothing
// to invite to. The builder prompt's "Invitations" section names the same ids.
export const EVENT_TEMPLATES = ["wedding-invite", "party-invite", "wedding-envelope-3d", "wedding-invite-3d", "party-invite-3d"] as const satisfies readonly TemplateId[]

// Templates whose reveal ends on a gift card: without a gift they open on nothing.
// party-box shows a gift only when it has one, so it needs one only when it is
// given as a gift (BuildInput.giftRequired).
export const GIFT_TEMPLATES = ["gift-reveal", "gift-box-3d", "gift-3d"] as const satisfies readonly TemplateId[]

function isOneOf(list: readonly TemplateId[], id: TemplateId): boolean {
  return list.includes(id)
}

// Problems the model should fix itself; empty when the content fits the template.
// Small things (door numbers, links, a bad timezone) are fixed in sanitize() instead.
export function checkContent(templateId: TemplateId, built: BuiltContent, options: { giftRequired?: boolean } = {}): string[] {
  const problems: string[] = []
  if (built.kind === "letter") {
    const c = built.content
    if (c.body.length < 1 || c.body.length > 6) problems.push(`body must have 1 to 6 paragraphs, not ${c.body.length}`)
    if (isOneOf(EVENT_TEMPLATES, templateId) && !c.event) {
      problems.push("an invitation needs the event (title, startsAt, locationName, address)")
    }
    if (c.gifts.length === 0) {
      if (templateId === "gift-reveal") problems.push("a gift reveal needs at least one gift")
      else if (templateId === "gift-box-3d") problems.push("a 3D gift box needs at least one gift")
      else if (templateId === "gift-3d") problems.push("a 3D gift tin needs at least one gift")
      else if (options.giftRequired) problems.push("this page is given as a gift, so it needs the gift from the brief")
    }
  } else {
    const c = built.content
    const doors = c.doors.length
    if (templateId === "advent-classic" && doors !== 24) problems.push(`the advent calendar needs exactly 24 doors, not ${doors}`)
    if (templateId === "countdown" && (doors < 1 || doors > 31)) problems.push(`a countdown needs 1 to 31 doors, not ${doors}`)
    if (!isRealDate(c.startDate)) problems.push(`startDate must be a real date as YYYY-MM-DD, not "${c.startDate}"`)
  }
  return problems
}

export function sanitize(built: BuiltContent, fallbackTimezone: string): BuiltContent {
  if (built.kind === "letter") {
    return { kind: "letter", content: { ...built.content, gifts: built.content.gifts.map(sanitizeGift) } }
  }
  const c = built.content
  return {
    kind: "calendar",
    content: {
      ...c,
      timezone: isValidTimezone(c.timezone) ? c.timezone : fallbackTimezone,
      // Doors are numbered by position so day N is always the Nth door.
      doors: c.doors.map((door, i) => ({ ...door, day: i + 1, ...(door.gift ? { gift: sanitizeGift(door.gift) } : {}) })),
    },
  }
}

export async function buildContent(input: BuildInput): Promise<BuiltContent> {
  const template = getTemplate(input.templateId)
  if (!template) throw new Error(`Unknown template ${input.templateId}`)
  const kind = template.kind
  const format = betaZodOutputFormat(schemaFor(kind))

  let problems: string[] | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) input.draft?.restart()
    let parsed: unknown
    // Read from the stream before the final message is parsed, so a refusal or
    // a cut-off is told apart from JSON that does not fit, even when parsing fails.
    let stopReason: string | null = null
    try {
      // Streamed with the same structured output format as a parse() call: the
      // SDK parses and validates the final message against the zod schema.
      const stream: BetaMessageStream<unknown> = getClient().beta.messages.stream({
        ...agentRequestBase(),
        max_tokens: MAX_TOKENS,
        system: BUILDER_SYSTEM_PROMPT,
        output_config: { effort: AGENT_EFFORT, format },
        messages: [{ role: "user", content: userPrompt(input, problems) }],
      })
      let textBlocks = 0
      for await (const event of stream) {
        if (event.type === "content_block_start" && event.content_block.type === "text") {
          // A fallback model starts its answer again in a new text block.
          if (textBlocks++ > 0) input.draft?.restart()
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          input.draft?.push(event.delta.text)
        } else if (event.type === "message_delta" && event.delta.stop_reason) {
          stopReason = event.delta.stop_reason
        }
      }
      const message = await stream.finalMessage()
      stopReason = message.stop_reason ?? stopReason
      if (stopReason === "refusal") throw new BuilderRefusal()
      if (stopReason === "max_tokens") {
        problems = [CUT_OFF]
        continue
      }
      parsed = message.parsed_output
    } catch (error) {
      // An APIError (rate limit, overload) or a refusal goes to the caller as it is.
      // Anything else here is output that failed JSON or schema validation.
      if (error instanceof Anthropic.APIError || error instanceof BuilderRefusal) throw error
      if (!(error instanceof Anthropic.AnthropicError)) throw error
      if (stopReason === "refusal") throw new BuilderRefusal()
      problems = [stopReason === "max_tokens" ? CUT_OFF : "the JSON did not match the schema"]
      continue
    } finally {
      // Whatever arrived since the last draft, so the screen ends on the full text.
      input.draft?.flush()
    }
    if (!parsed) {
      problems = ["there was no JSON in the answer"]
      continue
    }
    const built = { kind, content: parsed } as BuiltContent
    const found = checkContent(input.templateId, built, { giftRequired: input.giftRequired })
    if (found.length === 0) return sanitize(built, input.timezone)
    problems = found
  }
  throw new BuilderInvalidOutput(problems ?? [])
}

// A generic title for the dashboard and link previews: never message text,
// codes or a surname. One person by the first name ("Anna Schmidt" -> "Anna"),
// a group whole ("our friends", "Mia & Leo"), as page titles and previews do
// (shortName in lib/letters/names.ts, issue #62).
export function titleFor(templateId: TemplateId, recipientName: string): string {
  const name = recipientName.trim() ? shortName(recipientName) : "someone"
  switch (templateId) {
    case "gift-reveal":
    case "gift-box-3d":
    case "gift-3d":
    case "party-box":
      return `A gift for ${name}`
    case "wedding-invite":
    case "party-invite":
    case "wedding-envelope-3d":
    case "wedding-invite-3d":
    case "party-invite-3d":
      return `An invitation for ${name}`
    case "postcard":
      return `A postcard for ${name}`
    case "advent-classic":
      return `An advent calendar for ${name}`
    case "countdown":
      return `A countdown for ${name}`
    default:
      return `A letter for ${name}`
  }
}
