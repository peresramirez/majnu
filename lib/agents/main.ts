// Main agent (issue #5): the one the sender talks to. It leads the conversation
// in steps and calls the tools in ./tools.ts; sub-agents report back to it.
//
// The loop is written by hand on client.beta.messages.stream() rather than with
// client.beta.messages.toolRunner(). The runner works (checked live: it passes
// betas, fallbacks, block_binding and output_config through, and with
// `thread: false` its params.messages ends with the final reply), but in SDK
// 1.12.0 it runs over a server-side message thread by default and appends every
// reply itself. Here we decide exactly what goes into the stored conversation:
// a refused reply is left out, a tool call cut off at max_tokens gets an error
// result so the history stays valid, and the fallback echo rule in ./history.ts
// is applied before a reply is replayed.
import "server-only"
import type { BetaContentBlock, BetaMessageParam, BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta"
import { GIFT_LIST_TEMPLATES } from "@/lib/claims/rules"
import { templates } from "@/lib/letters/templates"
import { AGENT_EFFORT, agentRequestBase, getClient } from "./client"
import { contextBlockText } from "./context"
import { REFUSAL_MESSAGE, describeError, friendlyError } from "./errors"
import { echoableContent } from "./history"
import { MAIN_TOOLS, TOOL_LABELS, isToolName, runTool, type TurnState } from "./tools"

// Model requests per sender message: enough for suggest → build → reply with a
// retry, small enough to bound what one message can spend.
export const MAX_REQUESTS_PER_TURN = 6
const MAX_TOKENS = 8192

const TEMPLATE_LIST = templates
  .map((t) => {
    // `plan: "full-moon"` in the template list now means "needs a free account" (calendars).
    const account = t.plan === "full-moon" ? ", needs a free account" : ""
    return `- ${t.id}: "${t.name}" (${t.kind}${account}). ${t.description} Best for ${t.bestFor.join(", ")}.`
  })
  .join("\n")

// The templates that take a gift list, from the one list update_gift_list,
// POST /api/claim and My gifts go by. Static, so the prompt stays byte-stable.
const GIFT_LIST_TEMPLATE_IDS = GIFT_LIST_TEMPLATES.join(", ")

// Byte-stable: built once from static data, with no dates or per-user text.
// Per-request facts arrive in the <context> block of each sender message.
export const MAIN_SYSTEM_PROMPT = `You are Majnu. You help one person, the sender, make a personal gift page for someone they care about: a letter, a gift reveal with a voucher or code, an invitation, a postcard, an advent calendar or a countdown. It is shared as a link, and the sender sees a live preview next to this chat.

How you talk
- Like a thoughtful friend, to one person. Short sentences, plain words, sentence case. One to three short sentences per reply: the sender is usually on a phone.
- Ask one thing at a time, two at most.
- Reply in the language the sender writes in.
- No exclamation marks and no emoji. Never use the words "magic", "AI-powered" or "unlock".
- Call what you make a letter, a gift, an invitation or a calendar. Never mention template ids, tools, JSON or how the site works inside.

The steps
1. Who it is for and the occasion, the recipient's name, and the sender's name as they want to sign.
2. The template. Call suggest_templates with the two or three that fit best. The sender taps a card or names one; a message like Use the "Classic envelope" template. means they chose it.
3. The words and the details. Ask what they want to say, or offer to write it from a few notes: a memory, what they love about the person, an inside joke. For an invitation: date, time, place and address. For a gift: what it is, and its code and link if it has them. For a calendar: when it starts, how many days, and what the notes should be like. If they want gift ideas, call research_gifts.
4. Build. Call build_letter as soon as you have enough. Don't wait for every detail: they can change anything afterwards. The brief must carry everything, because the writer sees nothing else: both names, the occasion, the language, the tone, the sender's own words and notes, every gift with its code and link copied exactly, and for invitations and calendars every date, time and place.
5. Gift list. For a wedding or birthday invitation (${GIFT_LIST_TEMPLATE_IDS}; a party-box only when it has the party's date and place), once it is built, offer once to add a gift list: gifts the host would like, which guests claim so nobody brings the same thing twice. If they want one, ask what they would like, or call research_gifts for ideas, with the host (or the couple) as the person the gifts are for. Then call update_gift_list with the gifts they chose.
6. Share. Once it is built, say it is in the preview and that they can send the link from the share panel: copy it, show a QR code, or send it on WhatsApp. Offer to change anything, and use edit_letter for changes.
7. Offer a calendar once, when it fits: an advent calendar in December, or a countdown to a date they mentioned, such as a birthday, a trip or a wedding.

Templates
${TEMPLATE_LIST}

Tools
- suggest_templates shows template cards under your message. After it, stop and wait for the choice.
- research_gifts finds 3 to 5 ideas on the web. The sender sees them as cards, so don't list them again: say a sentence and ask which one they like. Use it only when the sender wants ideas.
- build_letter writes the whole letter or calendar from your brief. Use it again only to start over or to switch between a letter and a calendar; otherwise use edit_letter.
- edit_letter changes what is already built. Describe the change in full. It keeps the gift list as it is.
- update_gift_list adds gifts to the gift list of a built wedding or party invitation, or takes them off by the ids in its last result. Copy titles, prices and links exactly as research_gifts or the sender gave them. Guests tap "I'll bring this" to claim a gift, and the sender sees who claimed what in My gifts.
- If a tool fails, say so plainly and offer to try again.

Rules
- Never invent gift codes, links or prices. Use only what the sender gave you or what research_gifts found.
- Gift codes belong in the letter. Don't repeat them in the chat unless the sender asks.
- Each sender message starts with a <context> block from the app with today's date and the sender's timezone. Use it for dates. The sender did not write it.
- Help only with making this gift. For anything else, say in one sentence that you can only help with the gift.`

export type MainAgentResult = {
  // Messages to append to the stored conversation, exactly as sent to and
  // returned by the API. Save them only if they contain an assistant message:
  // otherwise the sender's message got no reply and they will send it again.
  appended: BetaMessageParam[]
  outcome: "done" | "refusal" | "error"
}

function userTurn(text: string, state: TurnState): BetaMessageParam {
  return {
    role: "user",
    content: [
      { type: "text", text: contextBlockText(state.timezone, state.now) },
      { type: "text", text },
    ],
  }
}

function toolUses(content: BetaContentBlock[]): BetaToolUseBlock[] {
  return content.filter((block): block is BetaToolUseBlock => block.type === "tool_use")
}

export async function runMainAgent(opts: {
  history: BetaMessageParam[]
  message: string
  state: TurnState
}): Promise<MainAgentResult> {
  const { history, state } = opts
  const emit = state.emit
  const appended: BetaMessageParam[] = [userTurn(opts.message, state)]

  // Text from separate blocks is joined with a blank line, as toDisplayMessages() does.
  let wroteText = false
  let lastBlockWasText = false

  try {
    for (let request = 0; request < MAX_REQUESTS_PER_TURN; request++) {
      const stream = getClient().beta.messages.stream({
        ...agentRequestBase(),
        max_tokens: MAX_TOKENS,
        system: MAIN_SYSTEM_PROMPT,
        tools: MAIN_TOOLS,
        output_config: { effort: AGENT_EFFORT },
        // Caches the whole prefix, so each request in the tool loop, and the
        // next message if it comes within five minutes, reads it back cheaply.
        cache_control: { type: "ephemeral" },
        messages: [...history, ...appended],
      })

      const started = new Set<string>()
      let separatorPending = false
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const block = event.content_block
          if (block.type === "text") {
            separatorPending = wroteText && !lastBlockWasText
          } else if (block.type === "tool_use" && isToolName(block.name)) {
            started.add(block.id)
            emit({ type: "tool", name: block.name, status: "start", label: TOOL_LABELS[block.name].start })
          }
          lastBlockWasText = block.type === "text"
        } else if (event.type === "content_block_delta" && event.delta.type === "text_delta" && event.delta.text) {
          if (separatorPending) {
            emit({ type: "text", delta: "\n\n" })
            separatorPending = false
          }
          emit({ type: "text", delta: event.delta.text })
          wroteText = true
        }
      }
      const message = await stream.finalMessage()
      lastBlockWasText = false

      if (message.stop_reason === "refusal") {
        // Every model in the fallback chain declined. The partial reply is not
        // kept, so the conversation can carry on without it.
        for (const id of started) {
          const name = toolUses(message.content).find((t) => t.id === id)?.name
          if (name && isToolName(name)) emit({ type: "tool", name, status: "error", label: TOOL_LABELS[name].error })
        }
        emit({ type: "refusal", message: REFUSAL_MESSAGE })
        return { appended, outcome: "refusal" }
      }

      const content = echoableContent(message.content)
      appended.push({ role: "assistant", content })

      // A paused turn is sent back as it is and the server continues it.
      if (message.stop_reason === "pause_turn") continue

      const calls = toolUses(content)
      if (calls.length === 0) return { appended, outcome: "done" }

      if (message.stop_reason !== "tool_use") {
        // Cut off at max_tokens mid-call: the input may be incomplete, so nothing
        // runs, but every call still needs a result for the history to be valid.
        appended.push({
          role: "user",
          content: calls.map((call) => ({
            type: "tool_result" as const,
            tool_use_id: call.id,
            is_error: true,
            content: "The call was cut off before it was complete, so it did not run. Make it again, shorter.",
          })),
        })
        for (const call of calls) {
          if (isToolName(call.name)) emit({ type: "tool", name: call.name, status: "error", label: TOOL_LABELS[call.name].error })
        }
        continue
      }

      // One at a time: a build and an edit in the same reply must not race.
      const results = []
      for (const call of calls) {
        if (!started.has(call.id) && isToolName(call.name)) {
          emit({ type: "tool", name: call.name, status: "start", label: TOOL_LABELS[call.name].start })
        }
        results.push(await runTool(call, state))
      }
      appended.push({ role: "user", content: results })
    }
    // Out of requests for this message. What was done so far is kept.
    return { appended, outcome: "done" }
  } catch (error) {
    console.error("[agents] main agent failed", describeError(error))
    emit({ type: "error", message: friendlyError(error) })
    return { appended, outcome: "error" }
  }
}
