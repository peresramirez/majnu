import type { BetaMessage, BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/client", () => ({ getClient: vi.fn(), agentRequestBase: () => ({}), AGENT_EFFORT: "low" }))
vi.mock("@/lib/agents/research", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/research")>()),
  researchGiftReport: vi.fn(),
}))
vi.mock("@/lib/finder/limits", () => ({ claimSearch: vi.fn(), releaseSearch: vi.fn(), canSearch: vi.fn(), claimProfileRead: vi.fn() }))
vi.mock("@/lib/social/read", () => ({ canReadSource: vi.fn(), readProfileInterests: vi.fn() }))

import { getClient } from "@/lib/agents/client"
import { ResearchIncomplete, ResearchRefusal, researchGiftReport, type ResearchReport } from "@/lib/agents/research"
import {
  contextBlockText,
  contextFor,
  FINDER_SYSTEM_PROMPT,
  FINDER_TOOL_CHOICE,
  FINDER_TOOLS,
  FindGiftsInput,
  MAX_FINDER_REQUESTS,
  parseFillWrap,
  runFinderTurn,
  STARTED_OVER_LINE,
  toOptions,
  type FinderTurnState,
} from "@/lib/finder/agent"
import type { FinderEvent } from "@/lib/finder/events"
import { canSearch, claimProfileRead, claimSearch, releaseSearch } from "@/lib/finder/limits"
import type { ProfileRead, StoredOptions } from "@/lib/finder/sessions"
import { canReadSource, readProfileInterests } from "@/lib/social/read"

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
    profile: null,
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
  vi.mocked(canReadSource).mockReturnValue(true)
  vi.mocked(claimProfileRead).mockImplementation(async ({ source, now }) => ({ ok: true, profile: { source, readAt: now.toISOString(), interests: [] } }))
  vi.mocked(readProfileInterests).mockResolvedValue({ ok: true, interests: ["Bouldern", "Kaffee", "Analogfotografie"] })
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

  it("asks for at most one tool call per reply, and makes the model decide every field", async () => {
    const { requests } = scriptModel(reply([findCall()]))
    await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(requests[0].tool_choice).toEqual({ type: "auto", disable_parallel_tool_use: true })
    expect(FINDER_TOOL_CHOICE.type).toBe("auto")
    const schema = FINDER_TOOLS[0].input_schema as { properties: Record<string, unknown>; required: string[] }
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort())
  })

  it("reads null as not given", async () => {
    scriptModel(reply([findCall({ ...MOTHER, name: null, age: null, senderAge: null, occasion: null, budget: null, interests: [] })]))
    await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(events[0]).toEqual({
      type: "context",
      context: { country: "DE", region: "Berlin", language: "de", currency: "EUR", relationship: "Mama", ageRange: [45, 70] },
    })
    expect(researchGiftReport).toHaveBeenCalledWith(expect.objectContaining({ occasion: "not given", budget: undefined }))
  })

  it("keeps the occasion it heard in the context, for the wrap step (issue #59)", async () => {
    const s = state()
    scriptModel(reply([findCall({ ...MOTHER, occasion: "Geburtstag" })]))
    await runFinderTurn({ history: [], message: "Ein Geburtstagsgeschenk für Mama", state: s })
    expect(events[0]).toMatchObject({ type: "context", context: { relationship: "Mama", occasion: "Geburtstag" } })
    expect(s.context.occasion).toBe("Geburtstag")
    expect(researchGiftReport).toHaveBeenCalledWith(expect.objectContaining({ occasion: "Geburtstag" }))
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
    expect(canSearch).toHaveBeenCalledWith("user-1", "session-1", expect.any(Date), "de")
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
    vi.mocked(canSearch).mockResolvedValue({ ok: false, reason: "session_full", message: "Zehn pro Suche." })
    scriptModel(reply([askCall([{ text: "Wie alt?", suggestions: ["60"] }])]))
    await runFinderTurn({ history: [], message: "Personalisieren", state: state({ lastOptions: shown }) })
    expect(events).toEqual([{ type: "limit", reason: "session_full", message: "Zehn pro Suche." }])
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

describe("reading a public profile", () => {
  const readCall = (input: Block = {}, id = "read-1"): Block => ({
    type: "tool_use",
    id,
    name: "read_profile",
    input: { link: "https://www.instagram.com/natgeo/", platform: null, language: "de", status: "Ich schaue mir ihr Profil an…", ...input },
  })
  const SISTER = { ...MOTHER, relationship: "Schwester", kind: "sibling", interests: ["Lesen"], about: "Die Schwester des Besuchers." }
  const toolResult = (request: Record<string, unknown>, id: string) =>
    ((request.messages as BetaMessageParam[]).at(-1)!.content as { tool_use_id: string; content: string; is_error?: boolean }[]).find(
      (block) => block.tool_use_id === id,
    )!

  it("may ask for a public profile once, whenever Majnu wants to know more, and only reads links the visitor gave", () => {
    expect(FINDER_TOOLS.map((tool) => tool.name)).toEqual(["find_gifts", "ask_questions", "read_profile", "fill_wrap"])
    expect(FINDER_SYSTEM_PROMPT).toContain("When you want to know more about the person, one of your questions may ask for a public Instagram, TikTok or LinkedIn profile")
    expect(FINDER_SYSTEM_PROMPT).toContain('"No public profile"')
    expect(FINDER_SYSTEM_PROMPT).toContain("Ask it once in a conversation at most")
    expect(FINDER_SYSTEM_PROMPT).toContain("One profile per conversation.")
    expect(FINDER_TOOLS[2].description).toContain("Instagram, TikTok or LinkedIn")
    expect(FINDER_SYSTEM_PROMPT).toContain("never guess one or look someone up")
    const schema = FINDER_TOOLS[2].input_schema as { properties: Record<string, unknown>; required: string[] }
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort())
  })

  it("reads the profile, then searches with its interests in the context and the research brief", async () => {
    const { requests } = scriptModel(reply([readCall()]), reply([findCall(SISTER)]))
    const s = state({ lastOptions: { options: [], recommendedId: "x", why: "" } })
    const result = await runFinderTurn({ history: [], message: "Hier ist ihr Insta: https://www.instagram.com/natgeo/", state: s })

    expect(readProfileInterests).toHaveBeenCalledWith({ source: "instagram", username: "natgeo" }, "de")
    expect(claimProfileRead).toHaveBeenCalledWith({
      session: { id: "session-1", ownerId: "user-1" },
      context: state().context,
      source: "instagram",
      now: expect.any(Date),
    })
    expect(events.map((e) => e.type)).toEqual(["status", "context", "status", "options"])
    expect(events[0]).toEqual({ type: "status", label: "Ich schaue mir ihr Profil an…" })
    // The model did not repeat the profile's interests; the server adds them for this search.
    expect(events[1]).toMatchObject({ type: "context", context: { interests: ["Lesen", "Bouldern", "Kaffee", "Analogfotografie"] } })
    expect(researchGiftReport).toHaveBeenCalledWith(expect.objectContaining({ recipient: expect.stringContaining("loves Lesen, Bouldern, Kaffee, Analogfotografie") }))
    expect(claimSearch).toHaveBeenCalledWith(expect.objectContaining({ personalised: true }))

    // The conversation keeps only the interests, and the session the marker with them.
    const read = toolResult(requests[1], "read-1")
    expect(JSON.parse(read.content)).toMatchObject({ interests: ["Bouldern", "Kaffee", "Analogfotografie"] })
    expect(read.is_error).toBeUndefined()
    expect(s.profile).toEqual({ source: "instagram", readAt: "2026-11-21T15:00:00.000Z", interests: ["Bouldern", "Kaffee", "Analogfotografie"] })
    expect(result.appended.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user"])
    expect(requests).toHaveLength(2)
  })

  it("does not repeat interests the model already passed on", async () => {
    scriptModel(reply([readCall()]), reply([findCall({ ...SISTER, interests: ["bouldern", "Lesen"] })]))
    await runFinderTurn({ history: [], message: "instagram.com/natgeo", state: state() })
    expect(events.find((e) => e.type === "context")).toMatchObject({ context: { interests: ["bouldern", "Lesen", "Kaffee", "Analogfotografie"] } })
  })

  it("fails politely for a private profile, and the search goes on without it", async () => {
    vi.mocked(readProfileInterests).mockResolvedValue({ ok: false, reason: "private" })
    const { requests } = scriptModel(reply([readCall()]), reply([text("Das Profil ist privat, ich suche ohne."), findCall(SISTER)]))
    const s = state()
    await runFinderTurn({ history: [], message: "instagram.com/natgeo", state: s })

    const read = toolResult(requests[1], "read-1")
    expect(read.content).toContain("the profile is private")
    expect(read.content).toContain("call find_gifts with what you know")
    expect(events.some((e) => e.type === "error")).toBe(false)
    expect(events.map((e) => e.type)).toEqual(["status", "text", "context", "status", "options"])
    expect(events.find((e) => e.type === "context")).toMatchObject({ context: { interests: ["Lesen"] } })
    // The read still counts: the session cannot read another profile.
    expect(s.profile).toEqual({ source: "instagram", readAt: "2026-11-21T15:00:00.000Z", interests: [] })
  })

  it("reads one profile per session", async () => {
    const profile: ProfileRead = { source: "tiktok", readAt: "2026-11-21T10:00:00.000Z", interests: ["Kaffee"] }
    const { requests } = scriptModel(reply([readCall({ link: "https://www.tiktok.com/@other" })]), reply([findCall(SISTER)]))
    await runFinderTurn({ history: [], message: "tiktok.com/@other", state: state({ profile }) })

    expect(claimProfileRead).not.toHaveBeenCalled()
    expect(readProfileInterests).not.toHaveBeenCalled()
    expect(toolResult(requests[1], "read-1").content).toContain("one profile per conversation")
    expect(events.map((e) => e.type)).toEqual(["context", "status", "options"])
  })

  it("stops at the site-wide daily cap, and searches without the profile", async () => {
    vi.mocked(claimProfileRead).mockResolvedValue({ ok: false, reason: "daily_cap" })
    const { requests } = scriptModel(reply([readCall()]), reply([findCall(SISTER)]))
    const s = state()
    await runFinderTurn({ history: [], message: "instagram.com/natgeo", state: s })

    expect(readProfileInterests).not.toHaveBeenCalled()
    expect(toolResult(requests[1], "read-1").content).toContain("no more profiles can be read today")
    expect(s.profile).toBeNull()
    expect(events.map((e) => e.type)).toEqual(["context", "status", "options"])
  })

  it("does not read a profile for a search the visitor could not run", async () => {
    vi.mocked(canSearch).mockResolvedValue({ ok: false, reason: "session_full", message: "Zehn pro Suche." })
    const { requests } = scriptModel(reply([readCall()]))
    await runFinderTurn({ history: [], message: "instagram.com/natgeo", state: state({ lastOptions: { options: [], recommendedId: "x", why: "" } }) })

    expect(canSearch).toHaveBeenCalledWith("user-1", "session-1", expect.any(Date), "de")
    expect(claimProfileRead).not.toHaveBeenCalled()
    expect(events).toEqual([{ type: "limit", reason: "session_full", message: "Zehn pro Suche." }])
    expect(requests).toHaveLength(1)
  })

  it("explains links it cannot read, without claiming a read", async () => {
    const { requests } = scriptModel(
      reply([readCall({ link: "https://www.instagram.com/p/DNQuxufAih9/" })]),
      reply([text("Schick mir den Link zum Profil.")], "end_turn"),
    )
    await runFinderTurn({ history: [], message: "https://www.instagram.com/p/DNQuxufAih9/", state: state() })
    expect(toolResult(requests[1], "read-1").content).toContain("instagram.com/name")
    expect(claimProfileRead).not.toHaveBeenCalled()
    expect(readProfileInterests).not.toHaveBeenCalled()
  })

  it("asks which platform a bare handle is on, and reads it once the visitor says", async () => {
    const { requests } = scriptModel(reply([readCall({ link: "@natgeo" })]), reply([text("Instagram oder TikTok?")], "end_turn"))
    await runFinderTurn({ history: [], message: "@natgeo", state: state() })
    expect(toolResult(requests[1], "read-1").content).toContain("whether it is on Instagram or TikTok")

    scriptModel(reply([readCall({ link: "@natgeo", platform: "tiktok" })]), reply([findCall(SISTER)]))
    await runFinderTurn({ history: [], message: "TikTok", state: state() })
    expect(readProfileInterests).toHaveBeenCalledWith({ source: "tiktok", username: "natgeo" }, "de")
  })

  it("says profiles can't be read when the deployment has no key for them", async () => {
    vi.mocked(canReadSource).mockReturnValue(false)
    const { requests } = scriptModel(reply([readCall()]), reply([findCall(SISTER)]))
    await runFinderTurn({ history: [], message: "instagram.com/natgeo", state: state() })
    expect(toolResult(requests[1], "read-1").content).toContain("can't be read at the moment")
    expect(claimProfileRead).not.toHaveBeenCalled()
  })

  it("searches without the profile when the claim cannot be recorded", async () => {
    vi.mocked(claimProfileRead).mockRejectedValue(new Error("Could not record the profile read: timeout"))
    const { requests } = scriptModel(reply([readCall()]), reply([findCall(SISTER)]))
    await runFinderTurn({ history: [], message: "instagram.com/natgeo", state: state() })
    expect(toolResult(requests[1], "read-1").content).toContain("technical reason")
    expect(events.some((e) => e.type === "error")).toBe(false)
    expect(events.some((e) => e.type === "options")).toBe(true)
  })
})

describe("searching now or asking first (issue #70)", () => {
  it("lets Majnu decide: search at once when it knows enough, ask first when it matters", () => {
    expect(FINDER_SYSTEM_PROMPT).not.toContain("Don't ask questions first")
    expect(FINDER_SYSTEM_PROMPT).toContain("Search at once with find_gifts")
    expect(FINDER_SYSTEM_PROMPT).toContain('"Find a gift for my mother" is enough')
    expect(FINDER_SYSTEM_PROMPT).toContain("Ask first with ask_questions when a missing fact would change the gifts a lot, or when the visitor asks you to research the person")
    expect(FINDER_SYSTEM_PROMPT).toContain("Don't ask again before you have shown options")
    expect(FINDER_TOOLS[1].description).toContain("before a first search")
  })

  it("asks where the gift goes instead of assuming the connection's place, and has no city written in", () => {
    expect(FINDER_SYSTEM_PROMPT).toContain('"my friend is from Venezuela"')
    expect(FINDER_SYSTEM_PROMPT).toContain("ask where the gift should be delivered or used")
    expect(FINDER_SYSTEM_PROMPT + JSON.stringify(FINDER_TOOLS)).not.toContain("Berlin")
  })

  it("reads only links and handles, and never looks anyone up by name or email address", () => {
    expect(FINDER_SYSTEM_PROMPT).toContain("You can't look anyone up by name or email address")
    expect(FINDER_SYSTEM_PROMPT).toContain("if the visitor gives an email address, say in one sentence")
  })

  it("asks questions before a first search, checked against this session's searches", async () => {
    scriptModel(reply([askCall([{ text: "Wo soll das Geschenk hin?", suggestions: ["Deutschland", "Venezuela"] }])]))
    const s = state()
    await runFinderTurn({ history: [], message: "Mein Freund ist aus Venezuela, 30, mag Videospiele", state: s })
    expect(events).toEqual([{ type: "question", text: "Wo soll das Geschenk hin?", suggestions: ["Deutschland", "Venezuela"] }])
    expect(canSearch).toHaveBeenCalledWith("user-1", "session-1", expect.any(Date), "de")
    expect(claimSearch).not.toHaveBeenCalled()
    expect(researchGiftReport).not.toHaveBeenCalled()
  })

  it("searches in the country the gift goes to, with its currency, when the visitor named another", async () => {
    const s = state()
    scriptModel(reply([findCall({ ...MOTHER, relationship: "Freund", kind: "friend", country: "ve" })]))
    await runFinderTurn({ history: [], message: "Es soll nach Venezuela gehen", state: s })
    expect(events[0]).toMatchObject({ type: "context", context: { country: "VE" } })
    // No Berlin and no euros: the visitor's region and currency say nothing about Venezuela.
    expect(s.context.region).toBeUndefined()
    expect(s.context.currency).toBeUndefined()
    expect(researchGiftReport).toHaveBeenCalledWith(expect.objectContaining({ countryCode: "VE", country: "Venezuela" }))
  })

  it("keeps the visitor's own place when the country is theirs, or not a country code", () => {
    const base = { country: "DE", region: "Berlin", language: "de", currency: "EUR" }
    const input = (country: unknown) => FindGiftsInput.parse({ ...MOTHER, country })
    expect(contextFor(base, input("DE"))).toMatchObject({ country: "DE", region: "Berlin", currency: "EUR" })
    expect(contextFor(base, input("Venezuela"))).toMatchObject({ country: "DE", region: "Berlin" })
    expect(contextFor(base, input("ES"))).toMatchObject({ country: "ES", currency: "EUR" })
    expect(contextFor(base, input("ES")).region).toBeUndefined()
  })

  it("keeps the person's name in the context, for the wrap step", async () => {
    scriptModel(reply([findCall({ ...MOTHER, name: "Ana" })]))
    await runFinderTurn({ history: [], message: "Für meine Mutter Ana", state: state() })
    expect(events[0]).toMatchObject({ type: "context", context: { name: "Ana" } })
  })

  it("adds one follow-up question under the options, only while a search is left", async () => {
    const followUp = { text: "Was macht sie in ihrer Freizeit?", suggestions: ["Garten", "Lesen", "Reisen"] }
    const { requests } = scriptModel(reply([findCall({ ...MOTHER, followUp })]))
    await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(events.map((e) => e.type)).toEqual(["context", "status", "options", "question"])
    expect(events[3]).toEqual({ type: "question", ...followUp })
    expect(requests).toHaveLength(1)

    events = []
    vi.mocked(canSearch).mockResolvedValue({ ok: false, reason: "session_full", message: "Voll." })
    scriptModel(reply([findCall({ ...MOTHER, followUp })]))
    await runFinderTurn({ history: [], message: "Mama", state: state() })
    expect(events.map((e) => e.type)).toEqual(["context", "status", "options"])
  })

  it("makes the model decide the country and the follow-up on every search", () => {
    const schema = FINDER_TOOLS[0].input_schema as { required: string[] }
    expect(schema.required).toEqual(expect.arrayContaining(["country", "followUp"]))
  })
})

describe("on the wrap step (issue #70)", () => {
  const option = { id: "o2", title: "Fotobuch <A4>", description: "40 Seiten.", reason: "Erinnerungen.", url: "https://fotobuch.example/a4" }
  const onWrap = (overrides: Partial<FinderTurnState> = {}) => state({ wrap: { option, templateId: "gift-box-3d" }, ...overrides })
  const fillCall = (input: Block, id = "fill-1"): Block => ({ type: "tool_use", id, name: "fill_wrap", input })

  it("tells Majnu in the context block which gift and design the visitor chose", () => {
    expect(contextBlockText(onWrap())).toBe(
      '<context>Today is Saturday 2026-11-21 in Europe/Berlin (UTC+01:00). Browser language: de-DE. Connection from: Berlin, Germany (DE). Local currency: EUR. The visitor chose "Fotobuch A4" and the 3D gift box design and is filling in the page.</context>',
    )
    expect(contextBlockText(state())).not.toContain("The visitor chose")
  })

  it("says so when the visitor opened the finder again and sees nothing from before", () => {
    expect(contextBlockText(state({ startedOver: true }))).toContain(STARTED_OVER_LINE)
    expect(contextBlockText(state())).not.toContain(STARTED_OVER_LINE)
  })

  it("answers in that frame: the system prompt and tools stay the same", async () => {
    const { requests } = scriptModel(reply([text("Schön, für Ana.")], "end_turn"))
    await runFinderTurn({ history: [], message: "für Ana", state: onWrap() })
    expect(requests[0].system).toBe(FINDER_SYSTEM_PROMPT)
    expect(JSON.stringify(requests[0].tools)).toBe(JSON.stringify(FINDER_TOOLS))
    expect(FINDER_SYSTEM_PROMPT).toContain("don't search again unless they ask for other gifts")
  })

  it("fills the form with what the visitor said, ends the turn, and never wraps", async () => {
    const { requests } = scriptModel(
      reply([text("Ich habe Ana und Javi eingetragen."), fillCall({ recipientName: "Ana", senderName: " Javi ", note: null, giftCode: null })]),
    )
    const result = await runFinderTurn({ history: [], message: "it's for my sister Ana, from Javi", state: onWrap() })
    expect(events).toEqual([
      { type: "text", delta: "Ich habe Ana und Javi eingetragen." },
      { type: "fill", fields: { recipientName: "Ana", senderName: "Javi" } },
    ])
    expect(requests).toHaveLength(1)
    expect(result.appended.at(-1)?.content).toEqual([expect.objectContaining({ tool_use_id: "fill-1", content: expect.stringContaining("not wrapped yet") })])
    expect(claimSearch).not.toHaveBeenCalled()
  })

  it("refuses to fill a form when the visitor is not on the wrap step, and lets Majnu answer in words", async () => {
    const { requests } = scriptModel(reply([fillCall({ recipientName: "Ana", senderName: null, note: null, giftCode: null })]), reply([text("Für wen?")], "end_turn"))
    await runFinderTurn({ history: [], message: "für Ana", state: state() })
    expect(events).toEqual([{ type: "text", delta: "Für wen?" }])
    expect(requests).toHaveLength(2)
  })

  it("parses fill_wrap: trimmed, cut to the form's limits, nulls and blanks left out", () => {
    expect(parseFillWrap({ recipientName: "  Ana ", senderName: null, note: "", giftCode: " GC-42 " })).toEqual({ recipientName: "Ana", giftCode: "GC-42" })
    const long = parseFillWrap({ recipientName: "x".repeat(99), senderName: null, note: "n".repeat(900), giftCode: "c".repeat(400) })!
    expect([long.recipientName?.length, long.note?.length, long.giftCode?.length]).toEqual([60, 600, 200])
    expect(parseFillWrap({ recipientName: null, senderName: null, note: null, giftCode: null })).toBeNull()
    expect(parseFillWrap({ recipientName: 42 })).toBeNull()
    expect(parseFillWrap(null)).toBeNull()
    const schema = FINDER_TOOLS[3].input_schema as { properties: Record<string, unknown>; required: string[] }
    expect([...schema.required].sort()).toEqual(Object.keys(schema.properties).sort())
  })
})
