// Builder sub-agent (issue #7): one structured-output call that turns a brief
// from the main agent into the content of a letter or calendar, validated
// against the contract in lib/letters/schema.ts. Retries once when the output
// does not fit the template.
import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod"
import { CalendarContent, LetterContent, type LetterKind, type TemplateId } from "@/lib/letters/schema"
import { getTemplate } from "@/lib/letters/templates"
import { AGENT_EFFORT, agentRequestBase, getClient } from "./client"
import { describeToday, isValidTimezone } from "./context"
import { httpsOnly } from "./safe-url"

export type BuiltContent =
  | { kind: "letter"; content: LetterContent }
  | { kind: "calendar"; content: CalendarContent }

export type BuildInput = {
  templateId: TemplateId
  now: Date
  // The sender's IANA timezone.
  timezone: string
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
- Write as the sender, in the first person, to the recipient. Warm, specific and personal: use the details in the brief. Plain words, short sentences, nothing generic or flowery.
- Use the sender's own phrases where they gave them. Do not invent memories or facts about their lives. When the brief is thin, stay simple and sincere rather than making things up.
- No exclamation marks unless the sender used them. No emoji unless the sender asked.
- headline: under 60 characters. body: 1 to 6 short paragraphs; for a gift reveal, an invitation or a postcard, 1 or 2.
- occasion: a short label such as "Birthday", "Wedding", "Thank you", "Just because".
- theme: the palette and font that suit the occasion and the template, unless the sender asked for something.

Gifts
- Include only gifts the brief names. Copy codes, links and prices exactly, character for character. Never invent a code, a link, a price or an image.
- Links must start with https://. Leave out any link that does not.
- A gift reveal needs at least one gift. Other letters usually have none: an empty list.

Invitations (wedding-invite, party-invite)
- Fill event: a title, startsAt as local ISO 8601 with the UTC offset that applies on that date in that timezone (for example 2026-12-24T19:00:00+01:00), locationName, and a street address a map can find.
- Use the date, time and place from the brief. If the time is missing, pick a sensible one for the occasion.
- recipientName may be a group ("Everyone", "Friends") when the invitation is for several people.

Calendars
- advent-classic: exactly 24 doors, days 1 to 24. startDate is 1 December of this year, or of next year if this year's Christmas has passed, unless the brief says otherwise.
- countdown: 1 to 31 doors, one per day. Door N opens on startDate + (N - 1) days. Unless the brief says otherwise, the last door opens on the big day itself, so work startDate back from that date and the number of days.
- Door titles are short. Each message is one to three sentences and different from the others: memories, small plans, encouragement, little dares. Build towards the last door.
- Put a gift on a door only when the brief names it for that door or day.
- timezone: the recipient's IANA timezone if the brief gives it, otherwise the sender's.

Editing
- When you are given the current content and a change, apply the change and keep everything else exactly as it is, unless the change requires otherwise. Return the whole content.`

const MAX_TOKENS = 16000

function schemaFor(kind: LetterKind) {
  return kind === "calendar" ? CalendarContent : LetterContent
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
      JSON.stringify(input.current),
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

// Problems the model should fix itself; empty when the content fits the template.
// Small things (door numbers, links, a bad timezone) are fixed in sanitize() instead.
export function checkContent(templateId: TemplateId, built: BuiltContent): string[] {
  const problems: string[] = []
  if (built.kind === "letter") {
    const c = built.content
    if (c.body.length < 1 || c.body.length > 6) problems.push(`body must have 1 to 6 paragraphs, not ${c.body.length}`)
    if ((templateId === "wedding-invite" || templateId === "party-invite") && !c.event) {
      problems.push("an invitation needs the event (title, startsAt, locationName, address)")
    }
    if (templateId === "gift-reveal" && c.gifts.length === 0) problems.push("a gift reveal needs at least one gift")
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
    let parsed: unknown
    try {
      const message = await getClient().beta.messages.parse({
        ...agentRequestBase(),
        max_tokens: MAX_TOKENS,
        system: BUILDER_SYSTEM_PROMPT,
        output_config: { effort: AGENT_EFFORT, format },
        messages: [{ role: "user", content: userPrompt(input, problems) }],
      })
      if (message.stop_reason === "refusal") throw new BuilderRefusal()
      if (message.stop_reason === "max_tokens") {
        problems = ["the answer was cut off; keep the messages shorter"]
        continue
      }
      parsed = message.parsed_output
    } catch (error) {
      // An APIError (rate limit, overload) or a refusal goes to the caller as it is.
      // Anything else here is output that failed JSON or schema validation.
      if (error instanceof Anthropic.APIError || error instanceof BuilderRefusal) throw error
      if (!(error instanceof Anthropic.AnthropicError)) throw error
      problems = ["the JSON did not match the schema"]
      continue
    }
    if (!parsed) {
      problems = ["there was no JSON in the answer"]
      continue
    }
    const built = { kind, content: parsed } as BuiltContent
    const found = checkContent(input.templateId, built)
    if (found.length === 0) return sanitize(built, input.timezone)
    problems = found
  }
  throw new BuilderInvalidOutput(problems ?? [])
}

// A generic title for the dashboard and link previews: never message text or codes.
export function titleFor(templateId: TemplateId, recipientName: string): string {
  const name = recipientName.trim().slice(0, 40) || "someone"
  switch (templateId) {
    case "gift-reveal":
      return `A gift for ${name}`
    case "wedding-invite":
    case "party-invite":
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
