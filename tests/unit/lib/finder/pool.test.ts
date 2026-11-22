import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/client", () => ({ getClient: vi.fn(), agentRequestBase: () => ({ model: "test-model" }), AGENT_EFFORT: "low" }))

import { getClient } from "@/lib/agents/client"
import {
  MAX_POOL_IDEAS,
  POOL_CAPS,
  POOL_TAVILY_SYSTEM_PROMPT,
  POOL_WEB_SYSTEM_PROMPT,
  poolPrompt,
  poolSize,
  researchPool,
  ResearchIncomplete,
  ResearchRefusal,
  toPoolOptions,
  toPoolReport,
  type PoolInput,
} from "@/lib/finder/pool"

const INPUT: PoolInput = {
  mode: "pool",
  recipient: "Anna, my girlfriend (the visitor's partner), probably about 20 to 35 years old (assumed), loves Yoga, Tee.",
  calendar: "An advent calendar with 24 doors, one a day from 2026-12-01.",
  doorBudget: "unter 10 €",
  lastDoorBudget: "bis 50 €",
  country: "Berlin, Germany",
  countryCode: "DE",
  currency: "EUR",
  language: "de",
  ideas: 28,
  now: new Date("2026-11-22T10:00:00Z"),
  timezone: "Europe/Berlin",
}

type Block = Record<string, unknown>
const reply = (content: Block[], stop_reason = "tool_use") => ({ content, stop_reason }) as unknown as BetaMessage
const search = (id: string, query = `q ${id}`): Block => ({ type: "tool_use", id, name: "search_web", input: { query } })
const report = (ideas: unknown[], lastDoor: number | null = null, id = "report"): Block => ({
  type: "tool_use",
  id,
  name: "report_ideas",
  input: { ideas, lastDoor, why: lastDoor ? "Für den 24." : "" },
})

function scriptModel(...replies: BetaMessage[]) {
  const requests: MessageCreateParamsNonStreaming[] = []
  const create = vi.fn(async (params: MessageCreateParamsNonStreaming) => {
    requests.push(structuredClone(params))
    const next = replies.shift()
    if (!next) throw new Error("the model was called more often than scripted")
    return next
  })
  vi.mocked(getClient).mockReturnValue({ beta: { messages: { create } } } as never)
  return { create, requests }
}

function tavilyResults(urls: string[]) {
  return new Response(
    JSON.stringify({
      results: urls.map((url, i) => ({ title: `Shop ${i}`, url, content: "Kleines Geschenk.", images: [`${url}/product.jpg`] })),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

describe("the pool's size and brief", () => {
  it("asks for a few more ideas than doors, 12 to 30", () => {
    expect(poolSize(24)).toBe(28)
    expect(poolSize(3)).toBe(12)
    expect(poolSize(31)).toBe(MAX_POOL_IDEAS)
  })

  it("names the person, both budgets, the country, the language, the currency and the caps", () => {
    const prompt = poolPrompt(INPUT)
    expect(prompt).toContain("Who it is for: Anna, my girlfriend")
    expect(prompt).toContain("Budget per door: unter 10 €")
    expect(prompt).toContain("Budget for the last door: bis 50 €")
    expect(prompt).toContain("Country or city: Berlin, Germany")
    expect(prompt).toContain("Language: German (de)")
    expect(prompt).toMatch(/Currency: EUR\. Prices there look like this: 39,90\s€/)
    expect(prompt).toContain(`You have at most ${POOL_CAPS.pool.searches} searches.`)
    expect(prompt).toContain("Report exactly 28 ideas.")
  })

  it("asks for ideas like the one the sender liked, and not the ones already found", () => {
    const prompt = poolPrompt({
      ...INPUT,
      mode: "similar",
      ideas: 6,
      similarTo: { title: "Lavendel-Badesalz", description: "Badesalz.", price: "8,90 €", shop: "Seifenmanufaktur" },
      avoid: ["Lavendel-Badesalz", "Yoga-Socken"],
    })
    expect(prompt).toContain("wants more like it: Lavendel-Badesalz (Seifenmanufaktur), 8,90 €.")
    expect(prompt).toContain("do not repeat them: Lavendel-Badesalz; Yoga-Socken.")
    expect(prompt).toContain(`You have at most ${POOL_CAPS.similar.searches} searches.`)
  })

  it("keeps the system prompts free of per-request facts", () => {
    for (const system of [POOL_TAVILY_SYSTEM_PROMPT, POOL_WEB_SYSTEM_PROMPT]) {
      expect(system).not.toMatch(/2026|Anna|Berlin/)
      expect(system).toContain("report_ideas")
    }
  })
})

describe("turning a report into the pool", () => {
  const ideas = [
    { title: "Badesalz", description: "Lavendel.", reason: "Bäder.", price: "8,90 €", shop: "Seife", url: "https://seife.example/bad" },
    { title: "Yoga-Socken", reason: "Yoga.", url: "https://yoga.example/socken" },
    { title: "Ohne Link", reason: "Nichts." },
    { title: "badesalz", reason: "Same title.", url: "https://other.example/x" },
    { title: "Teeset", reason: "Tee.", url: "https://seife.example/bad/" },
    { title: "Fotobuch", reason: "Erinnerungen.", url: "https://foto.example/buch" },
  ]

  it("keeps only linked, distinct ideas with ids, and marks the one for the last door", () => {
    const parsed = toPoolReport({ ideas, lastDoor: 6, why: "Groß." }, undefined, 30)!
    let n = 0
    const { options, lastDoorId } = toPoolOptions(parsed, [], () => `id${++n}`)
    expect(options.map((o) => o.title)).toEqual(["Badesalz", "Yoga-Socken", "Fotobuch"])
    expect(options[0]).toEqual({
      id: "id1",
      title: "Badesalz",
      description: "Lavendel.",
      reason: "Bäder.",
      price: "8,90 €",
      url: "https://seife.example/bad",
      shop: "Seife",
    })
    expect(options[1].description).toBe("Yoga.")
    expect(lastDoorId).toBe("id3")
  })

  it("leaves out ideas already in the pool", () => {
    const parsed = toPoolReport({ ideas, lastDoor: null, why: "" }, undefined, 30)!
    const existing = [{ id: "x", title: "Yoga-Socken", description: "", reason: "", url: "https://elsewhere.example" }]
    expect(toPoolOptions(parsed, existing).options.map((o) => o.title)).toEqual(["Badesalz", "Fotobuch"])
  })

  it("drops links to sites no search returned, and keeps the photo of the page it links to", () => {
    const seen = {
      pages: new Map([["seife.example/bad", { title: "", url: "https://seife.example/bad", extract: "", imageUrl: "https://seife.example/bad.jpg" }]]),
      hosts: new Set(["seife.example"]),
    }
    const parsed = toPoolReport({ ideas, lastDoor: null, why: "" }, seen, 30)!
    expect(parsed.ideas[0].imageUrl).toBe("https://seife.example/bad.jpg")
    expect(parsed.ideas[1].url).toBeUndefined()
    expect(parsed.ideas[5].url).toBeUndefined()
  })

  it("rejects a report without ideas and ignores a lastDoor out of range", () => {
    expect(toPoolReport({ ideas: [], lastDoor: null, why: "" }, undefined, 30)).toBeNull()
    expect(toPoolReport({ ideas: [ideas[0]], lastDoor: 9, why: "" }, undefined, 30)?.lastDoor).toBeNull()
  })
})

describe("researchPool", () => {
  const savedKey = process.env.TAVILY_API_KEY
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    process.env.TAVILY_API_KEY = savedKey
  })

  it("searches Tavily with images in the visitor's country and language, then reports", async () => {
    process.env.TAVILY_API_KEY = "tvly-test"
    const fetchMock = vi.fn(async () => tavilyResults(["https://seife.example/bad", "https://yoga.example/socken"]))
    vi.stubGlobal("fetch", fetchMock)
    const { requests } = scriptModel(
      reply([search("s1"), search("s2")]),
      reply([report([{ title: "Badesalz", reason: "Bäder.", url: "https://seife.example/bad" }, { title: "Erfunden", reason: "x", url: "https://made-up.example/a" }])]),
    )
    const result = await researchPool(INPUT)
    expect(result.ideas).toHaveLength(2)
    expect(result.ideas[0]).toMatchObject({ url: "https://seife.example/bad", imageUrl: "https://seife.example/bad/product.jpg" })
    expect(result.ideas[1].url).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({ country: "germany", language: "de", include_images: true })
    expect(requests[0].system).toBe(POOL_TAVILY_SYSTEM_PROMPT)
    expect(requests[0].tools?.map((t) => (t as { name: string }).name)).toEqual(["search_web", "report_ideas"])
    expect(requests[0].output_config).toEqual({ effort: "low" })
    expect(requests[0].model).toBe("test-model")
  })

  it("stops searching after the pool's cap and asks for the report", async () => {
    process.env.TAVILY_API_KEY = "tvly-test"
    const fetchMock = vi.fn(async () => tavilyResults(["https://seife.example/bad"]))
    vi.stubGlobal("fetch", fetchMock)
    const many = Array.from({ length: 8 }, (_, i) => search(`s${i}`))
    const { requests } = scriptModel(
      reply(many),
      reply([report([{ title: "Badesalz", reason: "Bäder.", url: "https://seife.example/bad" }])]),
    )
    await researchPool(INPUT)
    expect(fetchMock).toHaveBeenCalledTimes(POOL_CAPS.pool.searches)
    const results = requests[1].messages.at(-1)!.content as unknown as Block[]
    expect(results.filter((r) => r.is_error)).toHaveLength(8 - POOL_CAPS.pool.searches)
  })

  it("uses Anthropic's web search without a Tavily key", async () => {
    process.env.TAVILY_API_KEY = ""
    const { requests } = scriptModel(reply([report([{ title: "Badesalz", reason: "Bäder.", url: "https://seife.example/bad" }])]))
    const result = await researchPool({ ...INPUT, mode: "similar", ideas: 6 })
    expect(result.ideas[0].url).toBe("https://seife.example/bad")
    expect(requests[0].system).toBe(POOL_WEB_SYSTEM_PROMPT)
    expect(requests[0].tools?.[0]).toEqual({ type: "web_search_20260209", name: "web_search", max_uses: POOL_CAPS.similar.searches })
  })

  it("throws on a refusal, and when the model never reports within the request cap", async () => {
    process.env.TAVILY_API_KEY = ""
    scriptModel(reply([], "refusal"))
    await expect(researchPool(INPUT)).rejects.toBeInstanceOf(ResearchRefusal)
    const texts = Array.from({ length: POOL_CAPS.pool.requests }, () => reply([{ type: "text", text: "hm" }], "end_turn"))
    const { create } = scriptModel(...texts)
    await expect(researchPool(INPUT)).rejects.toBeInstanceOf(ResearchIncomplete)
    expect(create.mock.calls.length).toBeLessThanOrEqual(POOL_CAPS.pool.requests)
  })
})
