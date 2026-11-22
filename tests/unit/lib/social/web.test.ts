import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { readWebPage, TAVILY_EXTRACT_URL } from "@/lib/social/web"

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("readWebPage", () => {
  it("asks Tavily Extract for the parts of one page about what the person loves, as text", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ results: [{ url: "https://anna-example.de/about", raw_content: "I love climbing [...] and coffee. Mail me: anna@anna-example.de" }], failed_results: [] }),
    )
    const text = await readWebPage("https://anna-example.de/about", "tvly-key")

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(TAVILY_EXTRACT_URL)
    expect(url).not.toContain("tvly-key")
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tvly-key")
    expect(JSON.parse(init.body as string)).toMatchObject({
      urls: ["https://anna-example.de/about"],
      extract_depth: "basic",
      format: "text",
      include_images: false,
      chunks_per_source: 3,
      query: expect.stringContaining("hobbies"),
    })
    expect(text).toEqual({ posts: ["I love climbing and coffee. Mail me:"], hashtags: [] })
  })

  it("fails politely for pages Tavily could not open, empty pages and errors", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [], failed_results: [{ url: "https://x.example", error: "404" }] }))
    await expect(readWebPage("https://x.example", "k")).rejects.toMatchObject({ reason: "not_found" })
    fetchMock.mockResolvedValueOnce(jsonResponse({ results: [{ url: "https://x.example", raw_content: "   " }] }))
    await expect(readWebPage("https://x.example", "k")).rejects.toMatchObject({ reason: "empty" })
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "limit" }, 432))
    await expect(readWebPage("https://x.example", "k")).rejects.toMatchObject({ reason: "blocked", status: 432 })
    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: "bad key" }, 401))
    await expect(readWebPage("https://x.example", "k")).rejects.toMatchObject({ reason: "failed", status: 401 })
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    await expect(readWebPage("https://x.example", "k")).rejects.toMatchObject({ reason: "failed" })
  })
})
