import type { BetaMessage, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/client", () => ({ getClient: vi.fn(), agentRequestBase: () => ({}), AGENT_EFFORT: "low" }))

import { getClient } from "@/lib/agents/client"
import {
  MAX_REQUESTS,
  MAX_SEARCHES,
  RESEARCH_SYSTEM_PROMPT,
  ResearchIncomplete,
  ResearchRefusal,
  researchGifts,
  TAVILY_RESEARCH_SYSTEM_PROMPT,
  toGiftIdeas,
} from "@/lib/agents/research"
import { SEARCH_TIMEOUT_MS, TAVILY_SEARCH_URL } from "@/lib/agents/tavily"

const input = {
  recipient: "Anna, my sister, loves pottery",
  occasion: "Birthday",
  budget: "about €50",
  country: "Germany",
  now: new Date("2026-11-21T10:00:00Z"),
  timezone: "Europe/Berlin",
}

const IDEA = { title: "Pottery class for two", reason: "She loves clay.", price: "€45", url: "https://shop.example/pottery" }

type Block = Record<string, unknown>

function reply(content: Block[], stop_reason = "tool_use"): BetaMessage {
  return { content, stop_reason } as unknown as BetaMessage
}
function searchCall(id: string, query = `query ${id}`): Block {
  return { type: "tool_use", id, name: "search_web", input: { query } }
}
function reportCall(ideas: unknown[] = [IDEA], id = "report"): Block {
  return { type: "tool_use", id, name: "report_gifts", input: { ideas } }
}

// A fake model that answers each request with the next scripted reply. Requests
// are copied when made, because the loop keeps appending to the same array.
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

function tavilyResponse(n = 1) {
  const results = Array.from({ length: n }, (_, i) => ({
    title: `Pottery shop ${i + 1}`,
    url: `https://shop.example/${i + 1}`,
    content: "Wheel-throwing class for two, two hours, €45.",
    score: 0.8,
    raw_content: null,
  }))
  return new Response(JSON.stringify({ query: "q", results, response_time: "0.5" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

// The content of the last message of a request: the results our code sent back.
function lastUserContent(request: MessageCreateParamsNonStreaming) {
  const last = request.messages.at(-1)
  expect(last?.role).toBe("user")
  return last?.content as unknown as Block[]
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  fetchMock.mockImplementation(async () => tavilyResponse())
  vi.stubGlobal("fetch", fetchMock)
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("researchGifts without TAVILY_API_KEY", () => {
  it.each(["", "   "])("uses Anthropic's server-side web search and never calls Tavily (key %j)", async (key) => {
    vi.stubEnv("TAVILY_API_KEY", key)
    const { requests } = scriptModel(reply([reportCall()]))

    await expect(researchGifts(input)).resolves.toEqual([IDEA])
    expect(requests[0].system).toBe(RESEARCH_SYSTEM_PROMPT)
    expect(requests[0].tools).toEqual([
      { type: "web_search_20260209", name: "web_search", max_uses: MAX_SEARCHES },
      expect.objectContaining({ name: "report_gifts" }),
    ])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("sends a paused server-side turn back so the search can continue", async () => {
    vi.stubEnv("TAVILY_API_KEY", "")
    const paused = [{ type: "server_tool_use", id: "srv1", name: "web_search", input: { query: "pottery" } }]
    const { requests } = scriptModel(reply(paused, "pause_turn"), reply([reportCall()]))

    await expect(researchGifts(input)).resolves.toEqual([IDEA])
    expect(requests).toHaveLength(2)
    expect(requests[1].messages.at(-1)).toEqual({ role: "assistant", content: paused })
  })

  it("throws ResearchRefusal on a refused reply", async () => {
    vi.stubEnv("TAVILY_API_KEY", "")
    scriptModel(reply([], "refusal"))
    await expect(researchGifts(input)).rejects.toBeInstanceOf(ResearchRefusal)
  })
})

describe("researchGifts with TAVILY_API_KEY", () => {
  beforeEach(() => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test")
  })

  it("swaps the server search for search_web and sends Tavily's results back", async () => {
    const { requests } = scriptModel(reply([searchCall("s1", "pottery class for two Berlin")]), reply([reportCall()]))

    await expect(researchGifts(input)).resolves.toEqual([IDEA])

    expect(requests[0].system).toBe(TAVILY_RESEARCH_SYSTEM_PROMPT)
    const tools = requests[0].tools as unknown as Block[]
    expect(tools.map((tool) => tool.name)).toEqual(["search_web", "report_gifts"])
    expect(tools.some((tool) => String(tool.type ?? "").startsWith("web_search"))).toBe(false)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(TAVILY_SEARCH_URL)
    expect(init?.method).toBe("POST")
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tvly-test")
    expect(JSON.parse(String(init?.body))).toMatchObject({ query: "pottery class for two Berlin", max_results: 5 })

    const [result] = lastUserContent(requests[1])
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "s1" })
    expect(result.is_error).toBeUndefined()
    expect(result.content).toContain("1. Pottery shop 1\nhttps://shop.example/1\nWheel-throwing class")
  })

  it("keeps the same tools and system prompt on every request, so they stay cacheable", async () => {
    const { requests } = scriptModel(reply([searchCall("s1")]), reply([searchCall("s2")]), reply([reportCall()]))
    await researchGifts(input)
    expect(requests).toHaveLength(3)
    for (const request of requests) {
      expect(request.system).toBe(requests[0].system)
      expect(JSON.stringify(request.tools)).toBe(JSON.stringify(requests[0].tools))
    }
  })

  it(`runs at most ${MAX_SEARCHES} searches per run`, async () => {
    const { requests } = scriptModel(
      reply([searchCall("s1"), searchCall("s2"), searchCall("s3")]),
      reply([searchCall("s4"), searchCall("s5"), searchCall("s6")]),
      reply([reportCall()]),
    )

    await expect(researchGifts(input)).resolves.toEqual([IDEA])
    expect(fetchMock).toHaveBeenCalledTimes(MAX_SEARCHES)
    expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).query)).toEqual([
      "query s1",
      "query s2",
      "query s3",
      "query s4",
    ])

    const results = lastUserContent(requests[2]).filter((block) => block.type === "tool_result")
    expect(results.map((r) => [r.tool_use_id, r.is_error ?? false])).toEqual([
      ["s4", false],
      ["s5", true],
      ["s6", true],
    ])
    expect(results[1].content).toMatch(/^No searches left\. Call report_gifts now/)
  })

  it(`stops after ${MAX_REQUESTS} model requests and runs no search it cannot use`, async () => {
    const { create, requests } = scriptModel(
      reply([searchCall("s1")]),
      reply([searchCall("s2")]),
      reply([searchCall("s3")]),
      reply([searchCall("s4")]),
    )

    await expect(researchGifts(input)).rejects.toBeInstanceOf(ResearchIncomplete)
    expect(create).toHaveBeenCalledTimes(MAX_REQUESTS)
    // The fourth reply's search would come back to no one.
    expect(fetchMock).toHaveBeenCalledTimes(MAX_REQUESTS - 1)
    // The last request carries the results and the request to report.
    expect(lastUserContent(requests[MAX_REQUESTS - 1]).at(-1)).toEqual({
      type: "text",
      text: "Call report_gifts now with the best 3 to 5 ideas you found.",
    })
    expect(lastUserContent(requests[1]).every((block) => block.type === "tool_result")).toBe(true)
  })

  it("turns a failed search into an is_error result and lets the model report", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ detail: { error: "limit" } }), { status: 432 }))
    const { requests } = scriptModel(reply([searchCall("s1")]), reply([reportCall([{ title: "Pottery voucher", reason: "Clay." }])]))

    await expect(researchGifts(input)).resolves.toEqual([{ title: "Pottery voucher", reason: "Clay." }])
    const [result] = lastUserContent(requests[1])
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "s1", is_error: true })
    expect(result.content).toBe("The search failed with HTTP 432. Try again with other words, or call report_gifts with what you have.")
    expect(console.warn).toHaveBeenCalledWith("[agents] tavily search failed:", "failed with HTTP 432")
  })

  it(`turns a search that takes over ${SEARCH_TIMEOUT_MS / 1000} seconds into an is_error result`, async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))
        }),
    )
    const { requests } = scriptModel(reply([searchCall("s1")]), reply([reportCall()]))

    const run = researchGifts(input)
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS)
    await expect(run).resolves.toEqual([IDEA])

    const [result] = lastUserContent(requests[1])
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "s1", is_error: true })
    expect(result.content).toMatch(/^The search timed out\./)
  })

  it("answers every tool call in a reply, including a report that did not fit", async () => {
    const { requests } = scriptModel(reply([searchCall("s1"), reportCall([], "bad")]), reply([reportCall()]))

    await expect(researchGifts(input)).resolves.toEqual([IDEA])
    const results = lastUserContent(requests[1])
    expect(results.map((r) => [r.tool_use_id, r.is_error ?? false])).toEqual([
      ["s1", false],
      ["bad", true],
    ])
    expect(results[1].content).toBe("The ideas did not match the schema. Call report_gifts again.")
  })
})

describe("toGiftIdeas", () => {
  it("drops links that are not https and caps the list at 5", () => {
    const ideas = Array.from({ length: 7 }, (_, i) => ({ title: `Idea ${i}`, reason: "Because.", url: "http://shop.example" }))
    const result = toGiftIdeas({ ideas })
    expect(result).toHaveLength(5)
    expect(result?.[0]).toEqual({ title: "Idea 0", reason: "Because." })
  })

  it("returns null for an input that does not fit", () => {
    expect(toGiftIdeas({ ideas: [] })).toBeNull()
    expect(toGiftIdeas({})).toBeNull()
  })
})
