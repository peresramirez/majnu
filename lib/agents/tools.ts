// The main agent's tools: their definitions (byte-stable, built once at module
// load) and what each one does, including the plan gates. Sub-agents return
// short results here; the main agent is always the one the sender talks to.
import "server-only"
import type { BetaTool, BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta"
import * as z from "zod/v4"
import { saveLetterContent } from "@/lib/letters/store"
import { TemplateId, type CalendarContent, type LetterContent, type LetterKind } from "@/lib/letters/schema"
import { getTemplate } from "@/lib/letters/templates"
import { canUseFeature, type LimitResult } from "@/lib/limits"
import { BuilderRefusal, buildContent, titleFor, type BuiltContent } from "./builder"
import type { ChatEvent } from "./events"
import { describeError } from "./errors"
import { ResearchRefusal, researchGifts } from "./research"

export type ToolName = "suggest_templates" | "research_gifts" | "build_letter" | "edit_letter"

// What one turn of the chat knows and changes. `letter` is updated after a build
// or an edit, so a later tool call in the same turn sees the new content.
export type TurnState = {
  letterId: string
  // For the share link in the build result; null if the store did not give one.
  shareUrl: string | null
  now: Date
  timezone: string
  emit: (event: ChatEvent) => void
  letter: {
    kind: LetterKind | null
    templateId: TemplateId | null
    content: LetterContent | CalendarContent | null
  }
}

export const TOOL_LABELS: Record<ToolName, { start: string; error: string }> = {
  suggest_templates: { start: "Picking a few templates…", error: "Something went wrong showing the templates." },
  research_gifts: { start: "Looking for gift ideas…", error: "Something went wrong looking for gift ideas." },
  build_letter: { start: "Writing your letter…", error: "Something went wrong writing the letter." },
  edit_letter: { start: "Making your changes…", error: "Something went wrong making the changes." },
}

export function isToolName(name: string): name is ToolName {
  return name in TOOL_LABELS
}

// ---------- Inputs ----------

const SuggestTemplatesInput = z.object({
  templateIds: z.array(TemplateId).min(1).max(4).describe("The two or three templates that fit best, best first"),
})

const ResearchGiftsInput = z.object({
  recipient: z
    .string()
    .min(1)
    .describe("Who the gift is for: how the sender knows them, age if known, what they love, what they already have"),
  occasion: z.string().min(1).describe("e.g. 'Birthday', 'Christmas', 'Thank you'"),
  budget: z.string().optional().describe("e.g. 'about €50'"),
  country: z.string().optional().describe("Where the gift will be bought or used, e.g. 'Berlin, Germany'"),
  language: z
    .string()
    .optional()
    .describe("The language the sender writes in, as an ISO 639-1 code such as 'de' or 'en'. The ideas are written in it."),
})

const BuildLetterInput = z.object({
  templateId: TemplateId,
  brief: z
    .string()
    .min(1)
    .describe(
      "Everything the builder needs, in full: the recipient's and sender's names and how the sender signs, the occasion, the language to write in, the tone, " +
        "the sender's own words and notes, every gift with its code, link and price copied exactly, for invitations the event title, date, time, place and street address, " +
        "for calendars the start date and number of days and what the notes should be like.",
    ),
})

const EditLetterInput = z.object({
  change: z
    .string()
    .min(1)
    .describe("The change the sender asked for, in full, with any new text in their own words and any codes or links copied exactly"),
  templateId: TemplateId.optional().describe("Only to move the same content to another template of the same kind"),
})

function definition(name: ToolName, description: string, schema: z.ZodObject): BetaTool {
  const { $schema, ...inputSchema } = z.toJSONSchema(schema) as Record<string, unknown>
  void $schema
  return { name, description, input_schema: inputSchema as BetaTool["input_schema"] }
}

// The order and wording never change between requests: tools are part of the
// cached prefix that every thinking block is bound to.
export const MAIN_TOOLS: BetaTool[] = [
  definition(
    "suggest_templates",
    "Show the sender cards for two or three templates that fit. They tap one, which sends an ordinary message such as: Use the \"Classic envelope\" template. After calling this, stop and wait for their choice.",
    SuggestTemplatesInput,
  ),
  definition(
    "research_gifts",
    "Search the web for 3 to 5 gift ideas for the recipient. The sender sees the ideas as cards. Use it only when the sender wants gift ideas.",
    ResearchGiftsInput,
  ),
  definition(
    "build_letter",
    "Write the letter, invitation, gift page or calendar from a full brief and show it in the sender's preview. Replaces any content built before. Use edit_letter for changes to what is already built.",
    BuildLetterInput,
  ),
  definition(
    "edit_letter",
    "Change the letter or calendar that is already built: wording, details, gifts, colours, or moving it to another template of the same kind.",
    EditLetterInput,
  ),
]

// ---------- Gates ----------

// Calendars need Full moon; the first build of an empty letter counts as one
// of the month's gifts on the free plan. Rebuilding or editing does not.
export async function checkBuild(kind: LetterKind, hasContent: boolean): Promise<LimitResult> {
  if (kind === "calendar") {
    const calendar = await canUseFeature("calendar")
    if (!calendar.ok) return calendar
  }
  if (!hasContent) {
    const gift = await canUseFeature("new_gift")
    if (!gift.ok) return gift
  }
  return { ok: true }
}

export function checkResearch(): Promise<LimitResult> {
  return canUseFeature("research")
}

// ---------- Running a call ----------

function result(toolUse: BetaToolUseBlock, content: string, isError = false): BetaToolResultBlockParam {
  return { type: "tool_result", tool_use_id: toolUse.id, content, ...(isError ? { is_error: true } : {}) }
}

function limitResult(toolUse: BetaToolUseBlock, limit: Extract<LimitResult, { ok: false }>): BetaToolResultBlockParam {
  return result(
    toolUse,
    `Not done: ${limit.message} The sender sees a note about their plan. Tell them kindly in a sentence or two and carry on with what they can do. Do not call this tool again in this turn.`,
  )
}

function describeBuilt(built: BuiltContent, templateName: string, shareUrl: string | null): string {
  const link = shareUrl ? ` The link to send is ${shareUrl}.` : ""
  if (built.kind === "calendar") {
    const c = built.content
    const gifts = c.doors.filter((d) => d.gift).length
    return `Done. "${templateName}" for ${c.recipientName}: "${c.headline}", ${c.doors.length} doors from ${c.startDate} (${c.timezone})${gifts ? `, ${gifts} with a gift` : ""}. It is in the preview now.${link}`
  }
  const c = built.content
  const event = c.event ? `, event "${c.event.title}" at ${c.event.startsAt}, ${c.event.locationName}` : ""
  const gifts = c.gifts.length ? `, ${c.gifts.length} gift${c.gifts.length > 1 ? "s" : ""}` : ""
  return `Done. "${templateName}" for ${c.recipientName}: headline "${c.headline}", ${c.body.length} paragraph${c.body.length > 1 ? "s" : ""}${gifts}${event}. It is in the preview now.${link}`
}

async function suggestTemplates(toolUse: BetaToolUseBlock, state: TurnState): Promise<BetaToolResultBlockParam> {
  const input = SuggestTemplatesInput.safeParse(toolUse.input)
  if (!input.success) return result(toolUse, `Invalid input: ${input.error.message}`, true)
  const ids = [...new Set(input.data.templateIds)]
  state.emit({ type: "templates", ids })
  return result(toolUse, "The cards are showing. Wait for the sender to choose.")
}

async function runResearch(toolUse: BetaToolUseBlock, state: TurnState): Promise<BetaToolResultBlockParam> {
  const input = ResearchGiftsInput.safeParse(toolUse.input)
  if (!input.success) return result(toolUse, `Invalid input: ${input.error.message}`, true)

  const gate = await checkResearch()
  if (!gate.ok) {
    state.emit({ type: "limit", reason: gate.reason, message: gate.message })
    return limitResult(toolUse, gate)
  }

  const ideas = await researchGifts({ ...input.data, now: state.now, timezone: state.timezone })
  state.emit({ type: "gifts", ideas })
  // JSON, so toDisplayMessages() can show the same cards when the chat is reopened.
  return result(toolUse, JSON.stringify({ ideas, note: "The sender sees these as cards. Do not list them again." }))
}

async function saveBuilt(state: TurnState, templateId: TemplateId, built: BuiltContent): Promise<void> {
  await saveLetterContent(state.letterId, {
    kind: built.kind,
    templateId,
    title: titleFor(templateId, built.content.recipientName),
    content: built.content,
  })
  state.letter = { kind: built.kind, templateId, content: built.content }
  state.emit({ type: "preview", letterId: state.letterId, kind: built.kind, templateId })
}

async function buildLetter(toolUse: BetaToolUseBlock, state: TurnState): Promise<BetaToolResultBlockParam> {
  const input = BuildLetterInput.safeParse(toolUse.input)
  if (!input.success) return result(toolUse, `Invalid input: ${input.error.message}`, true)
  const template = getTemplate(input.data.templateId)!

  const gate = await checkBuild(template.kind, state.letter.content !== null)
  if (!gate.ok) {
    state.emit({ type: "limit", reason: gate.reason, message: gate.message })
    return limitResult(toolUse, gate)
  }

  const built = await buildContent({
    mode: "build",
    templateId: template.id,
    brief: input.data.brief,
    now: state.now,
    timezone: state.timezone,
  })
  await saveBuilt(state, template.id, built)
  return result(toolUse, describeBuilt(built, template.name, state.shareUrl))
}

async function editLetter(toolUse: BetaToolUseBlock, state: TurnState): Promise<BetaToolResultBlockParam> {
  const input = EditLetterInput.safeParse(toolUse.input)
  if (!input.success) return result(toolUse, `Invalid input: ${input.error.message}`, true)

  const { content, templateId: currentTemplateId, kind: currentKind } = state.letter
  if (!content || !currentTemplateId || !currentKind) {
    return result(toolUse, "Nothing is built yet. Use build_letter first.", true)
  }
  const template = getTemplate(input.data.templateId ?? currentTemplateId)!
  if (template.kind !== currentKind) {
    return result(
      toolUse,
      `edit_letter keeps the same kind. To turn this ${currentKind} into a ${template.kind}, use build_letter with a full brief.`,
      true,
    )
  }

  const gate = await checkBuild(template.kind, true)
  if (!gate.ok) {
    state.emit({ type: "limit", reason: gate.reason, message: gate.message })
    return limitResult(toolUse, gate)
  }

  const built = await buildContent({
    mode: "edit",
    templateId: template.id,
    current: content,
    change: input.data.change,
    now: state.now,
    timezone: state.timezone,
  })
  await saveBuilt(state, template.id, built)
  return result(toolUse, describeBuilt(built, template.name, state.shareUrl))
}

const HANDLERS: Record<ToolName, (toolUse: BetaToolUseBlock, state: TurnState) => Promise<BetaToolResultBlockParam>> = {
  suggest_templates: suggestTemplates,
  research_gifts: runResearch,
  build_letter: buildLetter,
  edit_letter: editLetter,
}

// Runs one tool call and always returns a result: a tool_use without its
// tool_result would make the stored conversation unusable. Emits the tool's
// "done" or "error" status; the caller emitted "start" when the call began.
// Input the model can correct (an is_error result it reads and retries) still
// ends as "done": "error" is for real failures the sender should hear about.
export async function runTool(toolUse: BetaToolUseBlock, state: TurnState): Promise<BetaToolResultBlockParam> {
  if (!isToolName(toolUse.name)) return result(toolUse, `Unknown tool ${toolUse.name}.`, true)
  const name = toolUse.name
  const labels = TOOL_LABELS[name]
  try {
    const toolResult = await HANDLERS[name](toolUse, state)
    state.emit({ type: "tool", name, status: "done", label: labels.start })
    return toolResult
  } catch (error) {
    console.error("[agents] tool failed", name, describeError(error))
    state.emit({ type: "tool", name, status: "error", label: labels.error })
    if (error instanceof BuilderRefusal || error instanceof ResearchRefusal) {
      return result(toolUse, "The writer declined this request. Tell the sender you can't make this one and suggest changing it.", true)
    }
    return result(toolUse, "It failed for a technical reason. Tell the sender plainly and offer to try again.", true)
  }
}
