import type { BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/client", () => ({ getClient: vi.fn(), agentRequestBase: () => ({}), AGENT_EFFORT: "low" }))
vi.mock("@/lib/agents/research", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/research")>()),
  researchGiftReport: vi.fn(),
}))
vi.mock("@/lib/finder/limits", () => ({ claimSearch: vi.fn(), releaseSearch: vi.fn(), canSearch: vi.fn() }))

import { getClient } from "@/lib/agents/client"
import { ResearchIncomplete, ResearchRefusal, researchGiftReport, type ResearchReport } from "@/lib/agents/research"
import {
  contextBlockText,
  FINDER_SYSTEM_PROMPT,
  FINDER_TOOLS,
  MAX_FINDER_REQUESTS,
  runFinderTurn,
  toOptions,
  type FinderTurnState,
} from "@/lib/finder/agent"
import type { FinderEvent } from "@/lib/finder/events"
import { canSearch, claimSearch, releaseSearch } from "@/lib/finder/limits"
import type { StoredOptions } from "@/lib/finder/sessions"

type Block = Record<string, unknown>

function reply(content: Block[], stop_reason = "tool_use"): BetaMessage {
  return { content, stop_reason } as unknown as BetaMessage
}
const text = (t: string): Block => ({ type: "text", text: t })
const thinking: Block = { type: "thinking", thinking: "", signature: "sig" }

// The stream the SDK returns: content block events, then the final message.
function streamOf(message: BetaMessage) {
  const events: Block[] = []
  ;(message.content as unknown as Block[]).forEach((block, index) => {
    if (block.type === "text") {
      events.push({ type: "content_block_start", index, content_block: { type: "text", text: "" } })
      events.push({ type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } })
    } else {
      events.push({ type: "content_block_start", index, content_block: block })
    }
  })
  return {
    async *[Symbol.asyncIterator]() {
      yield* events
    },
    finalMessage: async () => message,
  }
}

function scriptModel(...replies: BetaMessage[]) {
  const requests: Record<string, unknown>[] = []
  const stream = vi.fn((params: Record<string, unknown>) => {
    requests.push(structuredClone(params))
    const next = replies.shift()
    if (!next) throw new Error("the model was called more often than scripted")
    return streamOf(next)
  })
  vi.mocked(getClient).mockReturnValue({ beta: { messages: { stream } } } as never)
  return { stream, requests }
}

const MOTHER = {
  relationship: "Mama",
  kind: "parent",
  about: "Die Mutter des Besuchers, mehr ist nicht bekannt.",
  language: "de",
  status: "Ich schaue nach Geschenken in Berlin…",
}
const findCall = (input: Block = MOTHER, id = "find-1"): Block => ({ type: "tool_use", id, name: "find_gifts", input })
const askCall = (questions: Block[], id = "ask-1"): Block => ({ type: "tool_use", id, name: "ask_questions", input: { questions } })

const REPORT: ResearchReport = {
  ideas: [
    { title: "Kräutergarten", description: "Sechs Kräuter zum Ziehen.", reason: "Sie gärtnert gern.", price: "34,95 €", shop: "Gartenshop", url: "https://garten.example/k", imageUrl: "https://garten.example/k.jpg" },
    { title: "Fotobuch", description: "Ein Buch voller Fotos.", reason: "Erinnerungen.", price: "29,99 €", shop: "Fotobuch", url: "https://fotobuch.example/a4" },
    { title: "Kochkurs", description: "Ein Abend in Berlin.", reason: "Gemeinsame Zeit.", price: "79 €", url: "https://kochen.example/berlin" },
  ],
  recommended: 1,
  why: "Ein Fotobuch erzählt eure Geschichte.",
}

let events: FinderEvent[]

function state(overrides: Partial<FinderTurnState> = {}): FinderTurnState {
  return {
    sessionId: "session-1",
    ownerId: "user-1",
    now: new Date("2026-11-21T15:00:00Z"),
    timezone: "Europe/Berlin",
    base: { country: "DE", region: "Berlin", language: "de", currency: "EUR" },
    browserLanguage: "de-DE",
    context: { country: "DE", region: "Berlin", language: "de", currency: "EUR" },
    lastOptions: null,
    emit: (event) => events.push(event),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  events = []
  vi.mocked(claimSearch).mockResolvedValue({ ok: true, claimId: 7 })
  vi.mocked(canSearch).mockResolvedValue({ ok: true })
  vi.mocked(researchGiftReport).mockResolvedValue(REPORT)
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("a first search", () => {
  it("streams context, status, then three options with a recommendation, and ends the turn", async () => {
    const { requests } = scriptModel(reply([thinking, findCall()]))
    const s = state()
    const result = await runFinderTurn({ history: [], message: "Finde ein Geschenk für meine Mutter", state: s })

    expect(events.map((e) => e.type)).toEqual(["context", "status", "options"])
    expect(events[0]).toEqual({
      type: "context",
      context: { country: "DE", region: "Berlin", language: "de", currency: "EUR", relationship: "Mama", ageRange: [45, 70] },
    })
    expect(events[1]).toEqual({ type: "status", label: "Ich schaue nach Geschenken in Berlin…" })
    const options = events[2] as Extract<FinderEvent, { type: "options" }>
    expect(options.options).toHaveLength(3)
    expect(options.options[0]).toMatchObject({
      title: "Kräutergarten",
      description: "Sechs Kräuter zum Ziehen.",
      reason: "Sie gärtnert gern.",
      price: "34,95 €",
      shop: "Gartenshop",
      url: "https://garten.example/k",
      imageUrl: "https://garten.example/k.jpg",
    })
    expect(new Set(options.options.map((o) => o.id)).size).toBe(3)
    expect(options.recommendedId).toBe(options.options[1].id)
    expect(options.why).toBe("Ein Fotobuch erzählt eure Geschichte.")

    // One finder request: no closing sentence after the options.
    expect(requests).toHaveLength(1)
    expect(result.outcome).toBe("done")
    expect(result.appended.map((m) => m.role)).toEqual(["user", "assistant", "user"])
    expect(result.appended[2].content).toEqual([expect.objectContaining({ type: "tool_result", tool_use_id: "find-1" })])
    expect(s.lastOptions?.options).toEqual(options.options)
    expect(s.context.relationship).toBe("Mama")
  })

  it("searches in the visitor's language and country, for three ideas with images", async () => {
    scriptModel(reply([findCall()]))
    await runFinderTurn({ history: [], message: "Finde ein Geschenk für meine Mutter", state: state() })

    expect(claimSearch).toHaveBeenCalledWith({ ownerId: "user-1", sessionId: "session-1", personalised: false, now: expect.any(Date), language: "de" })
    expect(researchGiftReport).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "de",
        countryCode: "DE",
        country: "Berlin, Germany",
        currency: "EUR",
        ideas: 3,
        images: true,
        occasion: "not given",
        recipient: expect.stringContaining("probably about 45 to 70 years old (assumed)"),
        timezone: "Europe/Berlin",
      }),
    )
  })

  it("streams the model's text, and starts each turn with the context block", async () => {
    const { requests } = scriptModel(reply([text("Gern."), findCall()]))
    await runFinderTurn({ history: [], message: "Geschenk für Mama", state: state() })

    expect(events[0]).toEqual({ type: "text", delta: "Gern." })
    const messages = requests[0].messages as BetaMessageParam[]
    expect(messages[0]).toEqual({
      role: "user",
      content: [
        { type: "text", text: contextBlockText(state()) },
        { type: "text", text: "Geschenk für Mama" },
      ],
    })
    expect(contextBlockText(state())).toBe(
      "<context>Today is Saturday 2026-11-21 in Europe/Berlin (UTC+01:00). Browser language: de-DE. Connection from: Berlin, Germany (DE). Local currency: EUR.</context>",
    )
  })

  it("keeps the system prompt and tools byte-stable", async () => {
    const { requests } = scriptModel(reply([findCall({ relationship: "Mama" }, "bad")]), reply([findCall()]))
    await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.system).toBe(FINDER_SYSTEM_PROMPT)
      expect(JSON.stringify(request.tools)).toBe(JSON.stringify(FINDER_TOOLS))
    }
    expect(FINDER_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/)
  })

  it("lets the model fix a call with missing fields, without searching", async () => {
    const { requests } = scriptModel(reply([findCall({ relationship: "Mama" }, "bad")]), reply([findCall()]))
    await runFinderTurn({ history: [], message: "Mama", state: state() })

    const retry = (requests[1].messages as BetaMessageParam[]).at(-1)!
    expect(retry.content).toEqual([expect.objectContaining({ tool_use_id: "bad", is_error: true })])
    expect(claimSearch).toHaveBeenCalledTimes(1)
  })

  it("uses an age the visitor gave instead of the default", async () => {
    scriptModel(reply([findCall({ ...MOTHER, age: { min: 60, max: 60 }, interests: ["Garten"], budget: "unter 50 €" })]))
    await runFinderTurn({ history: [], message: "Mama, sie wird 60", state: state() })
    expect(events[0]).toMatchObject({ context: { ageRange: [60, 60], interests: ["Garten"], budget: "unter 50 €" } })
  })

  it("answers in the language the visitor writes in, even from a German browser", async () => {
    scriptModel(reply([findCall({ ...MOTHER, relationship: "mum", language: "en", status: "Looking…" })]))
    await runFinderTurn({ history: [], message: "A gift for my mum", state: state() })
    expect(events[0]).toMatchObject({ context: { language: "en", currency: "EUR" } })
    expect(researchGiftReport).toHaveBeenCalledWith(expect.objectContaining({ language: "en" }))
  })

  it("answers with text and no search when the message is not about a gift yet", async () => {
    scriptModel(reply([text("Für wen suchst du ein Geschenk?")], "end_turn"))
    const result = await runFinderTurn({ history: [], message: "Hallo", state: state() })
    expect(events).toEqual([{ type: "text", delta: "Für wen suchst du ein Geschenk?" }])
    expect(result.appended.map((m) => m.role)).toEqual(["user", "assistant"])
    expect(claimSearch).not.toHaveBeenCalled()
  })
})

describe("personalising", () => {
  const shown: StoredOptions = toOptions(REPORT, (() => { let i = 0; return () => `o${++i}` })())!

  it("asks up to three questions with tappable answers, then waits", async () => {
    const { requests } = scriptModel(
      reply([
        text("Ein paar Fragen:"),
        askCall([
          { text: "Wie alt wird sie?", suggestions: ["50", "60", "70"] },
          { text: "Was macht sie gern?", suggestions: ["Garten", "Lesen", "Reisen", "Kochen", "Sport"] },
          { text: "Was arbeitet sie?", suggestions: [] },
          { text: "Eine vierte Frage?", suggestions: ["Ja"] },
        ]),
      ]),
    )
    const result = await runFinderTurn({ history: [], message: "Personalisieren", state: state({ lastOptions: shown }) })

    expect(events).toEqual([
      { type: "text", delta: "Ein paar Fragen:" },
      { type: "question", text: "Wie alt wird sie?", suggestions: ["50", "60", "70"] },
      { type: "question", text: "Was macht sie gern?", suggestions: ["Garten", "Lesen", "Reisen", "Kochen"] },
      { type: "question", text: "Was arbeitet sie?" },
    ])
    // Checked, not claimed: the search comes with the answers.
    expect(canSearch).toHaveBeenCalledWith("user-1", true, expect.any(Date), "de")
    expect(claimSearch).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
    expect(result.appended.at(-1)?.content).toEqual([expect.objectContaining({ tool_use_id: "ask-1" })])
  })

  it("searches again with the answers, counted as personalised", async () => {
    scriptModel(reply([findCall({ ...MOTHER, age: { min: 60, max: 60 }, interests: ["Garten"] }, "find-2")]))
    const s = state({ lastOptions: shown })
    await runFinderTurn({ history: [], message: "60, Garten", state: s })

    expect(claimSearch).toHaveBeenCalledWith(expect.objectContaining({ personalised: true }))
    expect(events.map((e) => e.type)).toEqual(["context", "status", "options"])
    expect(s.lastOptions).not.toBe(shown)
  })

  it("does not ask questions that would only lead to a refused search", async () => {
    vi.mocked(canSearch).mockResolvedValue({ ok: false, reason: "personalise_daily", message: "Zwei am Tag." })
    scriptModel(reply([askCall([{ text: "Wie alt?", suggestions: ["60"] }])]))
    await runFinderTurn({ history: [], message: "Personalisieren", state: state({ lastOptions: shown }) })
    expect(events).toEqual([{ type: "limit", reason: "personalise_daily", message: "Zwei am Tag." }])
  })
})

describe("limits and failures", () => {
  it("refuses kindly at a limit, without researching", async () => {
    vi.mocked(claimSearch).mockResolvedValue({ ok: false, reason: "finder_daily", message: "Drei am Tag." })
    const { requests } = scriptModel(reply([findCall()]))
    const result = await runFinderTurn({ history: [], message: "Mama", state: state() })

    expect(events).toEqual([{ type: "limit", reason: "finder_daily", message: "Drei am Tag." }])
    expect(researchGiftReport).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
    expect(result.appended.at(-1)?.content).toEqual([expect.objectContaining({ tool_use_id: "find-1", content: expect.stringContaining("Not searched") })])
  })

  it("gives the search back when research fails", async () => {
    vi.mocked(researchGiftReport).mockRejectedValue(new ResearchIncomplete())
    scriptModel(reply([findCall()]))
    const result = await runFinderTurn({ history: [], message: "Mama", state: state() })

    expect(releaseSearch).toHaveBeenCalledWith(7)
    expect(events.map((e) => e.type)).toEqual(["context", "status", "error"])
    expect(events.at(-1)).toEqual({ type: "error", message: "Bei der Geschenksuche ist etwas schiefgegangen. Versuch es noch einmal." })
    expect(result.appended.at(-1)?.content).toEqual([expect.objectContaining({ is_error: true })])
  })

  it("says so plainly when the researcher declines", async () => {
    vi.mocked(researchGiftReport).mockRejectedValue(new ResearchRefusal())
    scriptModel(reply([findCall()]))
    await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(events.at(-1)).toMatchObject({ type: "error", message: expect.stringContaining("Dabei kann ich nicht helfen") })
  })

  it("shows nothing it cannot link to, and gives that search back too", async () => {
    vi.mocked(researchGiftReport).mockResolvedValue({ ideas: [{ title: "Etwas", reason: "Grund." }], recommended: 0, why: "" })
    scriptModel(reply([findCall()]))
    const s = state()
    await runFinderTurn({ history: [], message: "Mama", state: s })
    expect(events.map((e) => e.type)).toEqual(["context", "status", "error"])
    expect(releaseSearch).toHaveBeenCalledWith(7)
    expect(s.lastOptions).toBeNull()
  })

  it("runs one search per message", async () => {
    scriptModel(reply([findCall(MOTHER, "a"), findCall(MOTHER, "b")]))
    const result = await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(claimSearch).toHaveBeenCalledTimes(1)
    expect(result.appended.at(-1)?.content).toEqual([
      expect.objectContaining({ tool_use_id: "a" }),
      expect.objectContaining({ tool_use_id: "b", is_error: true }),
    ])
  })

  it("keeps no reply the model refused", async () => {
    scriptModel(reply([text("Nein")], "refusal"))
    const result = await runFinderTurn({ history: [], message: "…", state: state() })
    expect(result.outcome).toBe("refusal")
    expect(result.appended.map((m) => m.role)).toEqual(["user"])
    expect(events.at(-1)).toMatchObject({ type: "error" })
  })

  it("answers a call cut off at max_tokens with an error result, then tries again", async () => {
    const { requests } = scriptModel(reply([findCall({ relationship: "Ma" }, "cut")], "max_tokens"), reply([findCall()]))
    await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(requests).toHaveLength(2)
    expect((requests[1].messages as BetaMessageParam[]).at(-1)?.content).toEqual([expect.objectContaining({ tool_use_id: "cut", is_error: true })])
    expect(events.at(-1)).toMatchObject({ type: "options" })
  })

  it(`stops after ${MAX_FINDER_REQUESTS} model requests`, async () => {
    const bad = () => reply([findCall({ relationship: "Mama" }, `bad-${Math.random()}`)])
    const { requests } = scriptModel(bad(), bad(), bad())
    const result = await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(requests).toHaveLength(MAX_FINDER_REQUESTS)
    expect(result.appended.at(-1)?.role).toBe("user")
  })

  it("turns a model error into a friendly error event", async () => {
    vi.mocked(getClient).mockReturnValue({
      beta: { messages: { stream: () => { throw new Error("socket hang up") } } },
    } as never)
    const result = await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(result.outcome).toBe("error")
    expect(events).toEqual([{ type: "error", message: "Bei der Geschenksuche ist etwas schiefgegangen. Versuch es noch einmal." }])
  })
})

describe("toOptions", () => {
  it("always keeps the recommended idea among the three", () => {
    const ideas = Array.from({ length: 5 }, (_, i) => ({ title: `Idee ${i}`, reason: "Grund.", url: `https://shop.example/${i}` }))
    const shown = toOptions({ ideas, recommended: 4, why: "" })!
    expect(shown.options.map((o) => o.title)).toEqual(["Idee 0", "Idee 1", "Idee 4"])
    expect(shown.recommendedId).toBe(shown.options[2].id)
    // Without a why, the recommended option's own reason is used.
    expect(shown.why).toBe("Grund.")
    // Without a description, the reason stands in.
    expect(shown.options[0].description).toBe("Grund.")
  })
})
