import Anthropic from "@anthropic-ai/sdk"
import type { BetaContentBlock, BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

// A fake client: each stream() call plays the next scripted reply.
const replies: Array<Partial<BetaMessage> | Error> = []
const requests: Array<Record<string, unknown>> = []

function streamOf(reply: Partial<BetaMessage>) {
  const content = (reply.content ?? []) as BetaContentBlock[]
  const events = content.flatMap((block, index) => {
    const start = { type: "content_block_start", index, content_block: block.type === "text" ? { ...block, text: "" } : block }
    return block.type === "text" ? [start, { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } }] : [start]
  })
  return {
    async *[Symbol.asyncIterator]() {
      yield* events
    },
    finalMessage: async () => ({ role: "assistant", type: "message", ...reply }) as BetaMessage,
  }
}

vi.mock("@/lib/agents/client", () => ({
  getClient: () => ({
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          // A copy: the loop keeps appending to the same arrays.
          requests.push(JSON.parse(JSON.stringify(params)))
          const reply = replies.shift()
          if (!reply) throw new Error("no scripted reply left")
          if (reply instanceof Error) throw reply
          return streamOf(reply)
        },
      },
    },
  }),
  agentRequestBase: () => ({
    model: "claude-opus-5-5",
    betas: ["thinking-binding-controls-2026-08-01", "server-side-fallback-2026-07-01"],
    thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } },
    fallbacks: "default",
  }),
  AGENT_EFFORT: "low",
}))

vi.mock("@/lib/agents/tools", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/tools")>()),
  runTool: vi.fn(async (toolUse: { id: string }) => ({ type: "tool_result", tool_use_id: toolUse.id, content: "Done." })),
}))
vi.mock("@/lib/limits", () => ({ canUseFeature: vi.fn() }))
vi.mock("@/lib/letters/store", () => ({ saveLetterContent: vi.fn() }))

import type { ChatEvent } from "@/lib/agents/events"
import { MAIN_SYSTEM_PROMPT, runMainAgent } from "@/lib/agents/main"
import { MAIN_TOOLS, runTool, type TurnState } from "@/lib/agents/tools"

let events: ChatEvent[]
const state = (): TurnState => ({
  letterId: "letter-1",
  shareUrl: null,
  now: new Date("2026-11-21T12:00:00Z"),
  timezone: "Europe/Berlin",
  emit: (event) => events.push(event),
  letter: { kind: null, templateId: null, content: null },
})

const text = (t: string) => ({ type: "text", text: t, citations: null }) as BetaContentBlock
const toolUse = (id: string, name: string, input: unknown = {}) => ({ type: "tool_use", id, name, input }) as BetaContentBlock
const thinking = { type: "thinking", thinking: "", signature: "sig" } as BetaContentBlock

beforeEach(() => {
  events = []
  replies.length = 0
  requests.length = 0
  vi.mocked(runTool).mockClear()
})

describe("runMainAgent", () => {
  it("sends a byte-stable request with the plan's settings and per-request facts in the user turn", async () => {
    replies.push({ content: [text("Hello.")], stop_reason: "end_turn" })
    const history: BetaMessageParam[] = [
      { role: "user", content: "earlier" },
      { role: "assistant", content: [text("earlier reply")] as never },
    ]
    await runMainAgent({ history, message: "A letter for Anna", state: state() })

    const request = requests[0]!
    expect(request.system).toBe(MAIN_SYSTEM_PROMPT)
    expect(request.tools).toEqual(JSON.parse(JSON.stringify(MAIN_TOOLS)))
    expect(request.output_config).toEqual({ effort: "low" })
    expect(request.thinking).toEqual({ type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } })
    expect(request.fallbacks).toBe("default")
    expect(request).not.toHaveProperty("temperature")
    expect(request).not.toHaveProperty("tool_choice")
    expect(MAIN_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/)

    const messages = request.messages as BetaMessageParam[]
    // The stored history goes first, unchanged.
    expect(messages.slice(0, 2)).toEqual(JSON.parse(JSON.stringify(history)))
    const turn = messages[2]!.content as Array<{ type: string; text: string }>
    expect(turn[0]!.text).toMatch(/^<context>Today is Saturday 2026-11-21 in Europe\/Berlin/)
    expect(turn[1]).toEqual({ type: "text", text: "A letter for Anna" })
  })

  it("runs tools, appends every reply as returned, and separates the replies' text", async () => {
    replies.push(
      { content: [thinking, text("Let me write it."), toolUse("t1", "build_letter", { templateId: "classic-envelope", brief: "x" })], stop_reason: "tool_use" },
      { content: [thinking, text("It is in the preview.")], stop_reason: "end_turn" },
    )
    const result = await runMainAgent({ history: [], message: "Go", state: state() })

    expect(result.outcome).toBe("done")
    expect(result.appended.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"])
    expect(result.appended[1]!.content).toEqual([thinking, text("Let me write it."), toolUse("t1", "build_letter", { templateId: "classic-envelope", brief: "x" })])
    expect(result.appended[2]!.content).toEqual([{ type: "tool_result", tool_use_id: "t1", content: "Done." }])
    expect(runTool).toHaveBeenCalledTimes(1)

    const streamed = events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join("")
    expect(streamed).toBe("Let me write it.\n\nIt is in the preview.")
    expect(events).toContainEqual({ type: "tool", name: "build_letter", status: "start", label: "Writing your letter…" })
    // The second request replays the first reply and the tool result.
    expect((requests[1]!.messages as unknown[]).length).toBe(3)
  })

  it("keeps nothing of a refused reply and reports the refusal", async () => {
    replies.push({ content: [text("I was about to")], stop_reason: "refusal" })
    const result = await runMainAgent({ history: [], message: "Something odd", state: state() })

    expect(result.outcome).toBe("refusal")
    expect(result.appended.some((m) => m.role === "assistant")).toBe(false)
    expect(events.at(-1)).toMatchObject({ type: "refusal" })
  })

  it("answers a tool call cut off at max_tokens with an error result instead of running it", async () => {
    replies.push(
      { content: [toolUse("t1", "build_letter", { templateId: "classic-envelope" })], stop_reason: "max_tokens" },
      { content: [text("Sorry, trying again later.")], stop_reason: "end_turn" },
    )
    const result = await runMainAgent({ history: [], message: "Go", state: state() })

    expect(runTool).not.toHaveBeenCalled()
    const results = result.appended[2]!.content as Array<{ type: string; tool_use_id: string; is_error?: boolean }>
    expect(results).toEqual([expect.objectContaining({ type: "tool_result", tool_use_id: "t1", is_error: true })])
    expect(events).toContainEqual({ type: "tool", name: "build_letter", status: "error", label: "Something went wrong writing the letter." })
  })

  it("leaves out what the declining model wrote before a mid-reply fallback", async () => {
    const fallback = { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-5" }, trigger: {} } as unknown as BetaContentBlock
    replies.push({ content: [thinking, text("Dear "), fallback, text("Anna.")], stop_reason: "end_turn" })
    const result = await runMainAgent({ history: [], message: "Go", state: state() })

    expect(result.appended[1]!.content).toEqual([text("Dear "), fallback, text("Anna.")])
  })

  it("turns an API error into a friendly error event and keeps what was done", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    replies.push(
      { content: [toolUse("t1", "suggest_templates", { templateIds: ["postcard"] })], stop_reason: "tool_use" },
      new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers()),
    )
    const result = await runMainAgent({ history: [], message: "Go", state: state() })

    expect(result.outcome).toBe("error")
    expect(events.at(-1)).toEqual({ type: "error", message: "A lot of people are making gifts right now. Try again in a minute." })
    // The tool round is complete, so the history is still valid to save.
    expect(result.appended.map((m) => m.role)).toEqual(["user", "assistant", "user"])
  })

  it("resends a paused turn so the server can continue it", async () => {
    replies.push({ content: [text("Part one")], stop_reason: "pause_turn" }, { content: [text(" and two.")], stop_reason: "end_turn" })
    const result = await runMainAgent({ history: [], message: "Go", state: state() })

    expect(requests).toHaveLength(2)
    expect(result.appended.map((m) => m.role)).toEqual(["user", "assistant", "assistant"])
  })
})

describe("MAIN_SYSTEM_PROMPT", () => {
  it("names every template that takes a gift list in the gift-list step", async () => {
    const { GIFT_LIST_TEMPLATES } = await import("@/lib/claims/rules")
    const step = MAIN_SYSTEM_PROMPT.split("\n").find((line) => line.startsWith("5. Gift list."))
    expect(step).toBeDefined()
    for (const id of GIFT_LIST_TEMPLATES) expect(step).toContain(id)
    expect(step).toContain("wedding-invite, party-invite, wedding-envelope-3d, party-box")
  })
})

// The preview grows with every message (issue #30).
describe("MAIN_SYSTEM_PROMPT and live drafts", () => {
  it("asks for a first draft as soon as the recipient and occasion are known, and an edit for each new fact", () => {
    expect(MAIN_SYSTEM_PROMPT).toContain("A first draft, in the same turn you learn both. Call build_letter")
    expect(MAIN_SYSTEM_PROMPT).toContain("call edit_letter in that same turn, before you reply")
    expect(MAIN_SYSTEM_PROMPT).toContain("One edit_letter per message")
    expect(MAIN_SYSTEM_PROMPT).toContain("A message can change the page at most twice")
  })
})
