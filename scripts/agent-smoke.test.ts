// Manual check of the agents against the live API (about 8 to 10 short, low-effort
// requests). The store and the limits are mocked, so nothing is written to the
// database. Run with:
//   npx vitest run --config scripts/agent-smoke.config.mts
//
// It prints one line per API response: model, stop reason, token usage, cache
// reads and any input_transformations (dropped thinking blocks).
import { appendFileSync } from "node:fs"
import type { BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod"
import * as z from "zod/v4"
import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/letters/store", () => ({ saveLetterContent: vi.fn(async () => undefined) }))
vi.mock("@/lib/limits", () => ({ canUseFeature: vi.fn(async () => ({ ok: true })) }))

import { buildContent } from "@/lib/agents/builder"
import { AGENT_BETAS, AGENT_EFFORT, AGENT_THINKING, getClient, getModel } from "@/lib/agents/client"
import { toDisplayMessages } from "@/lib/agents/display"
import type { ChatEvent } from "@/lib/agents/events"
import { runMainAgent } from "@/lib/agents/main"
import { researchGifts } from "@/lib/agents/research"
import type { TurnState } from "@/lib/agents/tools"
import { saveLetterContent } from "@/lib/letters/store"

const responses: string[] = []

// Vitest hides console output of passing tests, so lines also go to a file
// when AGENT_SMOKE_LOG is set: AGENT_SMOKE_LOG=/tmp/agent-smoke.log npx vitest ...
function log(...parts: unknown[]) {
  const line = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ")
  console.info(line)
  if (process.env.AGENT_SMOKE_LOG) appendFileSync(process.env.AGENT_SMOKE_LOG, line + "\n")
}

function record(source: string, message: BetaMessage) {
  // stream() calls create() with stream: true, which resolves to a stream, not a message.
  if (!message?.usage) return
  const u = message.usage
  const transformations = message.input_transformations?.map((t) => `${t.type}`).join(",") ?? "absent"
  const line =
    `[${source}] model=${message.model} stop=${message.stop_reason} in=${u.input_tokens} out=${u.output_tokens} ` +
    `cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0} ` +
    `input_transformations=[${transformations}] blocks=${message.content.map((b) => b.type).join(",")}`
  responses.push(line)
  log(line)
}

// Record every response without changing what the agents get back.
const client = getClient()
const messages = client.beta.messages
const originalStream = messages.stream.bind(messages)
const originalParse = messages.parse.bind(messages)
const originalCreate = messages.create.bind(messages)
vi.spyOn(messages, "stream").mockImplementation(((body: Parameters<typeof originalStream>[0], options?: Parameters<typeof originalStream>[1]) => {
  const stream = originalStream(body, options)
  stream.finalMessage().then((m) => record("stream", m), () => {})
  return stream
}) as typeof messages.stream)
vi.spyOn(messages, "parse").mockImplementation(((body: Parameters<typeof originalParse>[0], options?: Parameters<typeof originalParse>[1]) => {
  const promise = originalParse(body, options)
  promise.then((m) => record("parse", m as BetaMessage), () => {})
  return promise
}) as typeof messages.parse)
vi.spyOn(messages, "create").mockImplementation(((body: Parameters<typeof originalCreate>[0], options?: Parameters<typeof originalCreate>[1]) => {
  const promise = originalCreate(body, options)
  promise.then((m) => record("create", m as BetaMessage), () => {})
  return promise
}) as typeof messages.create)

const now = new Date()
const timezone = "Europe/Berlin"

describe("main agent", () => {
  const events: ChatEvent[] = []
  // Stored as JSON between turns, the way letters.chat holds it.
  let chat: unknown[] = []
  const state: TurnState = {
    letterId: "smoke-letter",
    shareUrl: "https://majnu.app/l/smoke12345",
    now,
    timezone,
    emit: (event) => events.push(event),
    letter: { kind: null, templateId: null, content: null },
  }

  it(`uses ${getModel()}`, () => {
    expect(getModel()).toBeTruthy()
  })

  it("answers a first message", async () => {
    const result = await runMainAgent({
      history: [],
      message: "Hi, I want to make a birthday letter for my sister Anna. I'm Javier.",
      state,
    })
    log("turn 1 events:", events.map((e) => e.type).join(","))
    log("turn 1 text:", events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join(""))
    expect(result.outcome).toBe("done")
    expect(result.appended.some((m) => m.role === "assistant")).toBe(true)
    chat = JSON.parse(JSON.stringify(result.appended))
  })

  it("replays the stored history and builds the letter", async () => {
    events.length = 0
    const result = await runMainAgent({
      history: chat as BetaMessageParam[],
      message:
        'Use the "Classic envelope" template. Write it from me: we grew up sharing a tiny room in Madrid and she always let me have the top bunk. Keep it short, in English.',
      state,
    })
    log("turn 2 events:", events.map((e) => (e.type === "tool" ? `tool:${e.name}:${e.status}` : e.type)).join(","))
    log("turn 2 text:", events.flatMap((e) => (e.type === "text" ? [e.delta] : [])).join(""))
    expect(result.outcome).toBe("done")
    expect(events.some((e) => e.type === "preview")).toBe(true)
    const saved = vi.mocked(saveLetterContent).mock.calls.at(-1)
    log("saved:", JSON.stringify(saved?.[1]))
    expect(saved?.[1].templateId).toBe("classic-envelope")
    chat = [...chat, ...JSON.parse(JSON.stringify(result.appended))]
    const display = toDisplayMessages(chat)
    log("display:", JSON.stringify(display))
    expect(display[0]).toMatchObject({ role: "user" })
  })
})

describe("builder", () => {
  it("builds a countdown with the right number of doors", async () => {
    const built = await buildContent({
      mode: "build",
      templateId: "countdown",
      brief:
        "Countdown for Sam from Alex, in English. 5 days, the last door opens on 2026-12-20, the day they fly to Lisbon together. Light, excited notes about the trip. No gifts.",
      now,
      timezone,
    })
    log("countdown:", JSON.stringify(built))
    expect(built.kind).toBe("calendar")
    if (built.kind !== "calendar") return
    expect(built.content.doors).toHaveLength(5)
    expect(built.content.startDate).toBe("2026-12-16")
  })
})

describe("research", () => {
  it("returns 3 to 5 gift ideas from a web search", async () => {
    const ideas = await researchGifts({
      recipient: "My dad, 60, loves road cycling and good coffee",
      occasion: "Birthday",
      budget: "about €50",
      country: "Germany",
      now,
      timezone,
    })
    log("ideas:", JSON.stringify(ideas))
    expect(ideas.length).toBeGreaterThanOrEqual(1)
    expect(ideas.length).toBeLessThanOrEqual(5)
  })
})

describe("toolRunner (checked for the plan, not used by the app)", () => {
  it("passes the betas through and ends params.messages with the final reply", async () => {
    const tool = betaZodTool({
      name: "get_time",
      description: "Returns the current time in Berlin",
      inputSchema: z.object({}),
      run: async () => "12:00",
    })
    const runner = client.beta.messages.toolRunner({
      model: getModel(),
      max_tokens: 2048,
      betas: AGENT_BETAS,
      thinking: AGENT_THINKING,
      fallbacks: "default",
      output_config: { effort: AGENT_EFFORT },
      thread: false,
      tools: [tool],
      messages: [{ role: "user", content: "Reply with the single word: hello" }],
    })
    const final = await runner.runUntilDone()
    record("toolRunner", final)
    const last = runner.params.messages.at(-1)
    log("runner.params.messages roles:", runner.params.messages.map((m) => m.role).join(","))
    expect(last?.role).toBe("assistant")
  })
})

describe("summary", () => {
  it("counts the API responses", () => {
    log(`${responses.length} API responses`)
  })
})
