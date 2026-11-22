// The main agent's tools: their definitions (byte-stable, built once at module
// load) and what each one does, including the plan gates. Sub-agents return
// short results here; the main agent is always the one the sender talks to.
import "server-only"
import type { BetaTool, BetaToolResultBlockParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta"
import * as z from "zod/v4"
import { changeGiftList, MAX_GIFT_LIST_ITEMS, takesGiftList } from "@/lib/claims/rules"
import { saveLetterContent } from "@/lib/letters/store"
import { TemplateId, type CalendarContent, type LetterContent, type LetterKind } from "@/lib/letters/schema"
import { getTemplate } from "@/lib/letters/templates"
import { canUseFeature, type LimitResult } from "@/lib/limits"
import { BuilderRefusal, buildContent, contentForBuilder, titleFor, type BuiltContent } from "./builder"
import { createDraftStream, mergeOverCurrent, toCalendarDraft, toLetterDraft, type DraftSink } from "./draft"
import type { ChatEvent } from "./events"
import { describeError } from "./errors"
import { ResearchRefusal, researchGifts } from "./research"

export type ToolName = "suggest_templates" | "research_gifts" | "build_letter" | "edit_letter" | "update_gift_list"

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
  // Builder runs so far in this turn (build_letter and edit_letter), for MAX_BUILDS_PER_TURN.
  builds?: number
}

// Builder runs per sender message. The main agent edits the page after every
// message that adds a fact (issue #30), so this bounds what one message spends:
// a first build and one edit, or two edits. Each run is at most two builder requests.
export const MAX_BUILDS_PER_TURN = 2

export const TOOL_LABELS: Record<ToolName, { start: string; error: string }> = {
  suggest_templates: { start: "Picking a few templates…", error: "Something went wrong showing the templates." },
  research_gifts: { start: "Looking for gift ideas…", error: "Something went wrong looking for gift ideas." },
  build_letter: { start: "Writing your letter…", error: "Something went wrong writing the letter." },
  edit_letter: { start: "Making your changes…", error: "Something went wrong making the changes." },
  update_gift_list: { start: "Updating the gift list…", error: "Something went wrong updating the gift list." },
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

const GiftListItemInput = z.object({
  title: z.string().min(1).describe("What the gift is, as research_gifts or the sender named it"),
  description: z.string().optional().describe("One short sentence about it"),
  price: z.string().optional().describe("Display price with currency, copied exactly"),
  url: z.string().optional().describe("Shop link, copied exactly, https only"),
})

const UpdateGiftListInput = z.object({
  add: z.array(GiftListItemInput).max(MAX_GIFT_LIST_ITEMS).optional().describe("Gifts the sender chose to add"),
  removeIds: z
    .array(z.string())
    .max(MAX_GIFT_LIST_ITEMS)
    .optional()
    .describe("Ids of gifts to take off the list, from an earlier update_gift_list result"),
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
  definition(
    "update_gift_list",
    `Add gifts to the gift list at the end of a wedding or party invitation, or take them off by id. Guests tap "I'll bring this" to claim one, and a claimed gift is taken for everyone else. Only for an invitation that is already built. At most ${MAX_GIFT_LIST_ITEMS} gifts.`,
    UpdateGiftListInput,
  ),
]

// ---------- Gates ----------

// Calendars need a real account: a guest is asked to sign up first. New gifts
// are free for everyone (lib/limits.ts); the spending guard bounds them.
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

// The builder never sees the gift list (see builder.ts), so a rebuilt or edited
// letter keeps the one it had: its ids are what guests' claims refer to.
export function keepGiftList(previous: TurnState["letter"]["content"], built: BuiltContent): BuiltContent {
  if (built.kind !== "letter" || !previous || !("wishlist" in previous) || !previous.wishlist?.length) return built
  return { kind: "letter", content: { ...built.content, wishlist: previous.wishlist } }
}

async function saveBuilt(state: TurnState, templateId: TemplateId, fresh: BuiltContent): Promise<void> {
  const built = keepGiftList(state.letter.content, fresh)
  await saveLetterContent(state.letterId, {
    kind: built.kind,
    templateId,
    title: titleFor(templateId, built.content.recipientName),
    content: built.content,
  })
  state.letter = { kind: built.kind, templateId, content: built.content }
  state.emit({ type: "preview", letterId: state.letterId, kind: built.kind, templateId })
}

// Live drafts for the create page while the builder writes (lib/agents/draft.ts).
// An edit is shown over the current content, so what is not rewritten yet stays.
function draftSink(state: TurnState, kind: LetterKind, templateId: TemplateId, current: TurnState["letter"]["content"]): DraftSink {
  const base = current ? contentForBuilder(current) : null
  const merged = (partial: unknown) => (base ? mergeOverCurrent(base, partial) : partial)
  const { letterId } = state
  if (kind === "calendar") {
    return createDraftStream({
      shape: (partial) => toCalendarDraft(merged(partial)),
      emit: (content) => state.emit({ type: "draft", letterId, kind: "calendar", templateId, content }),
    })
  }
  return createDraftStream({
    shape: (partial) => toLetterDraft(merged(partial)),
    emit: (content) => state.emit({ type: "draft", letterId, kind: "letter", templateId, content }),
  })
}

// Counts a builder run against MAX_BUILDS_PER_TURN; false when none is left.
function takeBuild(state: TurnState): boolean {
  const used = state.builds ?? 0
  if (used >= MAX_BUILDS_PER_TURN) return false
  state.builds = used + 1
  return true
}

function buildCapResult(toolUse: BetaToolUseBlock): BetaToolResultBlockParam {
  return result(
    toolUse,
    `Not done: the page was already changed ${MAX_BUILDS_PER_TURN} times for this message, the most one message allows. Tell the sender in a sentence what is still to change, and make it after their next message, with every change in one edit_letter call.`,
  )
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

  if (!takeBuild(state)) return buildCapResult(toolUse)
  const built = await buildContent({
    mode: "build",
    templateId: template.id,
    brief: input.data.brief,
    now: state.now,
    timezone: state.timezone,
    // A new build starts from nothing, even over content built before.
    draft: draftSink(state, template.kind, template.id, null),
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

  if (!takeBuild(state)) return buildCapResult(toolUse)
  const built = await buildContent({
    mode: "edit",
    templateId: template.id,
    current: content,
    change: input.data.change,
    now: state.now,
    timezone: state.timezone,
    draft: draftSink(state, template.kind, template.id, content),
  })
  await saveBuilt(state, template.id, built)
  return result(toolUse, describeBuilt(built, template.name, state.shareUrl))
}

function describeGiftList(list: NonNullable<LetterContent["wishlist"]>): string {
  if (list.length === 0) return "The gift list is empty, so the invitation shows none."
  const lines = list.map((item) => `- ${item.id}: "${item.title}"${item.price ? ` (${item.price})` : ""}`)
  return `The gift list now has ${list.length} gift${list.length > 1 ? "s" : ""}, at the end of the invitation:\n${lines.join("\n")}`
}

async function updateGiftList(toolUse: BetaToolUseBlock, state: TurnState): Promise<BetaToolResultBlockParam> {
  const input = UpdateGiftListInput.safeParse(toolUse.input)
  if (!input.success) return result(toolUse, `Invalid input: ${input.error.message}`, true)
  if (!input.data.add?.length && !input.data.removeIds?.length) {
    return result(toolUse, "Give gifts to add or ids to remove.", true)
  }

  const { content, templateId, kind } = state.letter
  if (kind !== "letter" || !content || !templateId || !takesGiftList(templateId) || !("body" in content)) {
    return result(
      toolUse,
      "A gift list goes on a wedding or party invitation that is already built. Build the invitation first, or tell the sender it is only for invitations.",
      true,
    )
  }

  const change = changeGiftList(content.wishlist, input.data)
  const updated: LetterContent = { ...content, wishlist: change.list }
  await saveLetterContent(state.letterId, {
    kind: "letter",
    templateId,
    title: titleFor(templateId, content.recipientName),
    content: updated,
  })
  state.letter = { kind: "letter", templateId, content: updated }
  state.emit({ type: "preview", letterId: state.letterId, kind: "letter", templateId })

  const notes = [describeGiftList(change.list)]
  if (change.unknownIds.length) notes.push(`Not on the list, so nothing was removed for: ${change.unknownIds.join(", ")}.`)
  if (change.overLimit.length) notes.push(`The list is full (${MAX_GIFT_LIST_ITEMS} gifts), so these were not added: ${change.overLimit.join("; ")}.`)
  notes.push("It is in the preview now. The sender sees who claimed what in My gifts and can release a claim there.")
  return result(toolUse, notes.join("\n"))
}

const HANDLERS: Record<ToolName, (toolUse: BetaToolUseBlock, state: TurnState) => Promise<BetaToolResultBlockParam>> = {
  suggest_templates: suggestTemplates,
  research_gifts: runResearch,
  build_letter: buildLetter,
  edit_letter: editLetter,
  update_gift_list: updateGiftList,
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
