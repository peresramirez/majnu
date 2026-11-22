// Turns a stored conversation (Anthropic message format) into the messages the
// chat UI shows when a gift is reopened. Built with the main agent (issue #5).
//
// Everything the model wrote between two sender messages becomes one assistant
// message, as it streamed live: text blocks next to each other are joined as
// they are, separate ones with a blank line. Template cards come from
// suggest_templates calls, gift cards from research_gifts results. The app's
// <context> block, tool results and thinking are not shown.
import { TEMPLATE_IDS, type TemplateId } from "@/lib/letters/schema"
import { CONTEXT_TAG } from "./context"
import type { DisplayMessage, GiftIdea } from "./events"

type Block = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function blocksOf(content: unknown): Block[] {
  if (typeof content === "string") return [{ type: "text", text: content }]
  return Array.isArray(content) ? content.filter(isRecord) : []
}

function textOf(block: Block): string | null {
  return block.type === "text" && typeof block.text === "string" ? block.text : null
}

const templateIds = new Set<string>(TEMPLATE_IDS)

function templatesFrom(input: unknown): TemplateId[] {
  if (!isRecord(input) || !Array.isArray(input.templateIds)) return []
  const ids = input.templateIds.filter((id): id is TemplateId => typeof id === "string" && templateIds.has(id))
  return [...new Set(ids)]
}

function giftFrom(value: unknown): GiftIdea | null {
  if (!isRecord(value) || typeof value.title !== "string" || typeof value.reason !== "string") return null
  return {
    title: value.title,
    reason: value.reason,
    ...(typeof value.price === "string" ? { price: value.price } : {}),
    ...(typeof value.url === "string" ? { url: value.url } : {}),
  }
}

// research_gifts results are JSON: {"ideas": [...], "note": "..."}. A plan
// limit or an error comes back as plain text and shows no cards.
function giftsFrom(content: unknown): GiftIdea[] {
  const text = typeof content === "string" ? content : blocksOf(content).map(textOf).filter(Boolean).join("")
  try {
    const parsed: unknown = JSON.parse(text)
    if (!isRecord(parsed) || !Array.isArray(parsed.ideas)) return []
    return parsed.ideas.map(giftFrom).filter((idea): idea is GiftIdea => idea !== null)
  } catch {
    return []
  }
}

type Draft = { text: string; joinNext: boolean; templates: TemplateId[]; gifts: GiftIdea[] }

export function toDisplayMessages(chat: unknown[]): DisplayMessage[] {
  const out: DisplayMessage[] = []
  let draft: Draft | null = null
  // research_gifts calls waiting for their result, by tool_use id.
  const giftCalls = new Map<string, Draft>()

  const flush = () => {
    if (!draft) return
    const text = draft.text.trim()
    if (text || draft.templates.length || draft.gifts.length) {
      out.push({
        role: "assistant",
        text,
        ...(draft.templates.length ? { templates: draft.templates } : {}),
        ...(draft.gifts.length ? { gifts: draft.gifts } : {}),
      })
    }
    draft = null
  }

  for (const message of Array.isArray(chat) ? chat : []) {
    if (!isRecord(message)) continue
    const blocks = blocksOf(message.content)

    if (message.role === "assistant") {
      const current: Draft = draft ?? { text: "", joinNext: false, templates: [], gifts: [] }
      draft = current
      // A new reply in the same turn starts a new paragraph.
      current.joinNext = false
      for (const block of blocks) {
        const text = textOf(block)
        if (text !== null) {
          if (text) {
            if (current.text && !current.joinNext) current.text += "\n\n"
            current.text += text
          }
          current.joinNext = true
          continue
        }
        current.joinNext = false
        if (block.type === "tool_use" && block.name === "suggest_templates") {
          for (const id of templatesFrom(block.input)) if (!current.templates.includes(id)) current.templates.push(id)
        } else if (block.type === "tool_use" && block.name === "research_gifts" && typeof block.id === "string") {
          giftCalls.set(block.id, current)
        }
      }
      continue
    }

    if (message.role === "user") {
      for (const block of blocks) {
        if (block.type !== "tool_result" || typeof block.tool_use_id !== "string" || block.is_error === true) continue
        const target = giftCalls.get(block.tool_use_id)
        if (target) target.gifts.push(...giftsFrom(block.content))
      }
      const text = blocks
        .map(textOf)
        .filter((t): t is string => t !== null && !t.startsWith(CONTEXT_TAG))
        .join("\n\n")
        .trim()
      if (text) {
        flush()
        out.push({ role: "user", text })
      }
    }
    // Mid-conversation system messages and anything else are not shown.
  }
  flush()
  return out
}
