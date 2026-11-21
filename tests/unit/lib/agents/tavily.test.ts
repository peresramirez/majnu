import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { MAX_RESULTS, SEARCH_TIMEOUT_MS, searchTavily, TAVILY_SEARCH_URL, TavilySearchError } from "@/lib/agents/tavily"

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
}

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("searchTavily", () => {
  it("posts the query to the Search API with the key as a Bearer token", async () => {
    fetchMock.mockResolvedValue(json({ query: "q", results: [], response_time: "0.4" }))
    await searchTavily("  pottery class for two Berlin  ", "tvly-test")

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(TAVILY_SEARCH_URL)
    expect(TAVILY_SEARCH_URL).toBe("https://api.tavily.com/search")
    expect(init?.method).toBe("POST")
    expect(init?.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer tvly-test" })
    expect(JSON.parse(String(init?.body))).toEqual({
      query: "pottery class for two Berlin",
      search_depth: "basic",
      max_results: 5,
      chunks_per_source: 1,
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it("cuts a very long query to 400 characters", async () => {
    fetchMock.mockResolvedValue(json({ results: [] }))
    await searchTavily("a".repeat(1000), "tvly-test")
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).query).toHaveLength(400)
  })

  it("keeps at most 5 results and trims their text", async () => {
    const results = Array.from({ length: 8 }, (_, i) => ({
      title: `  Shop   ${i}\n` + "t".repeat(300),
      url: `https://shop.example/${i}`,
      content: "word\n\n  ".repeat(400),
      score: 0.9,
      raw_content: null,
    }))
    results[1].title = null as unknown as string
    fetchMock.mockResolvedValue(json({ query: "q", results }))

    const found = await searchTavily("q", "tvly-test")
    expect(found).toHaveLength(MAX_RESULTS)
    expect(found[0].url).toBe("https://shop.example/0")
    expect(found[0].title.startsWith("Shop 0 ttt")).toBe(true)
    expect(found[0].title.length).toBeLessThanOrEqual(120)
    expect(found[0].extract.length).toBeLessThanOrEqual(500)
    expect(found[0].extract).not.toMatch(/\s{2}|\n/)
    expect(found[1].title).toBe("")
    expect(Object.keys(found[0]).sort()).toEqual(["extract", "title", "url"])
  })

  it.each([401, 429, 432, 500])("throws on HTTP %i", async (status) => {
    fetchMock.mockResolvedValue(json({ detail: { error: "nope" } }, status))
    await expect(searchTavily("q", "tvly-test")).rejects.toThrow(new TavilySearchError(`failed with HTTP ${status}`))
  })

  it("throws on a body it does not understand", async () => {
    fetchMock.mockResolvedValueOnce(json({ answer: "no results field" }))
    await expect(searchTavily("q", "tvly-test")).rejects.toThrow("returned an unexpected response")
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }))
    await expect(searchTavily("q", "tvly-test")).rejects.toThrow("returned a body that is not JSON")
  })

  it("throws when Tavily cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"))
    await expect(searchTavily("q", "tvly-test")).rejects.toThrow(new TavilySearchError("could not be reached"))
  })

  it(`gives up after ${SEARCH_TIMEOUT_MS / 1000} seconds`, async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    let signal: AbortSignal | undefined
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          signal = init?.signal ?? undefined
          signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")))
        }),
    )

    const search = searchTavily("q", "tvly-test")
    const outcome = expect(search).rejects.toThrow(new TavilySearchError("timed out"))
    await vi.advanceTimersByTimeAsync(SEARCH_TIMEOUT_MS - 1)
    expect(signal?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await outcome
    expect(signal?.aborted).toBe(true)
  })

  it("clears its timer when the search finishes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] })
    fetchMock.mockResolvedValue(json({ results: [] }))
    await searchTavily("q", "tvly-test")
    expect(vi.getTimerCount()).toBe(0)
  })
})
