import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  MAX_RESULTS,
  productImage,
  SEARCH_TIMEOUT_MS,
  searchTavily,
  TAVILY_SEARCH_URL,
  TavilySearchError,
  tavilyCountry,
} from "@/lib/agents/tavily"

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

describe("searchTavily for the gift finder", () => {
  it("points the search at the visitor's country and language and asks for images", async () => {
    fetchMock.mockResolvedValue(json({ results: [] }))
    await searchTavily("Geschenk Mutter", "tvly-test", { country: "DE", language: "DE", images: true })
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      query: "Geschenk Mutter",
      search_depth: "basic",
      max_results: 5,
      chunks_per_source: 1,
      include_answer: false,
      include_raw_content: false,
      include_images: true,
      topic: "general",
      country: "germany",
      language: "de",
    })
  })

  it("leaves out a country Tavily does not know and a language that is not an ISO 639 code", async () => {
    fetchMock.mockResolvedValue(json({ results: [] }))
    await searchTavily("q", "tvly-test", { country: "HK", language: "de-DE" })
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).not.toHaveProperty("country")
    expect(body).not.toHaveProperty("topic")
    expect(body).not.toHaveProperty("language")
  })

  it("keeps each result's first photo, only when images were asked for", async () => {
    const results = [
      { title: "A", url: "https://shop.example/a", content: "x", images: [{ url: "https://cdn.example/logo.svg" }, { url: "https://cdn.example/a.jpg" }] },
      { title: "B", url: "https://shop.example/b", content: "y", images: [] },
    ]
    fetchMock.mockResolvedValue(json({ results }))
    const withImages = await searchTavily("q", "tvly-test", { images: true })
    expect(withImages.map((r) => r.imageUrl)).toEqual(["https://cdn.example/a.jpg", undefined])
    expect(Object.keys(withImages[1])).not.toContain("imageUrl")

    fetchMock.mockResolvedValue(json({ results }))
    const without = await searchTavily("q", "tvly-test")
    expect(without.every((r) => !("imageUrl" in r))).toBe(true)
  })

  it("still returns the results when the images come back in a shape it does not expect", async () => {
    fetchMock.mockResolvedValue(json({ results: [{ title: "A", url: "https://shop.example/a", content: "x", images: "nope" }] }))
    await expect(searchTavily("q", "tvly-test", { images: true })).resolves.toEqual([
      { title: "A", url: "https://shop.example/a", extract: "x" },
    ])
  })
})

describe("tavilyCountry", () => {
  it.each([
    ["DE", "germany"],
    ["de", "germany"],
    ["AT", "austria"],
    ["CH", "switzerland"],
    ["US", "united states"],
    ["GB", "united kingdom"],
    ["CZ", "czech republic"],
    ["TR", "turkey"],
    ["KR", "south korea"],
    ["BA", "bosnia and herzegovina"],
  ])("%s is %s", (code, name) => {
    expect(tavilyCountry(code)).toBe(name)
  })

  it.each([undefined, "", "XX", "HK", "AQ", "Germany", "DEU"])("%j is not sent", (code) => {
    expect(tavilyCountry(code)).toBeUndefined()
  })
})

describe("productImage", () => {
  it("takes an https photo, given as a string or an object with a url", () => {
    expect(productImage(["https://cdn.example/a.jpg"])).toBe("https://cdn.example/a.jpg")
    expect(productImage([{ url: "https://cdn.example/b.webp", description: "A mug" }])).toBe("https://cdn.example/b.webp")
  })

  it("skips http, data, svg, gif, logos and icons", () => {
    expect(
      productImage([
        "http://cdn.example/a.jpg",
        "data:image/png;base64,AAAA",
        "https://cdn.example/a.svg",
        "https://cdn.example/spacer.gif",
        "https://cdn.example/brand/logo.png",
        "https://cdn.example/icons/cart.png",
        "https://cdn.example/mug.jpg",
      ]),
    ).toBe("https://cdn.example/mug.jpg")
  })

  // The first images of real shop pages from the live check on 21 November.
  it("skips the labels, wordmarks and theme graphics real shop pages start with", () => {
    expect(
      productImage([
        "https://www.fraas.com/cdn/shop/t/121/assets/eu-warranty-label-de.png?v=66203898586436090121794924215",
        "https://teaser.prod.breuni.de/entd-camp/image/upload/v1761830985/Wortmarke_Gold2024_250px_cszeaj_dxamo7.png",
        "https://teaser.prod.breuni.de/suchen/image/upload/bilder/suchen_assets/weihnachten/weihnachten-logo.png",
        "https://shop.example/img/trustbadge.png",
        "https://shop.example/img/payment_paypal.png",
        "https://shop.example/img/flag-de.png",
        "https://shop.example/img/thumb_32x32.jpg",
        "https://www.fraas.com/cdn/shop/files/kaschmirschal-rose.jpg?v=1",
      ]),
    ).toBe("https://www.fraas.com/cdn/shop/files/kaschmirschal-rose.jpg?v=1")
  })

  it("prefers a photo file on a product path, then the earlier image", () => {
    expect(productImage(["https://shop.example/hero.png", "https://shop.example/products/schal.jpg"])).toBe("https://shop.example/products/schal.jpg")
    expect(productImage(["https://shop.example/a.jpg", "https://shop.example/b.jpg"])).toBe("https://shop.example/a.jpg")
    expect(productImage(["https://shop.example/a.png"])).toBe("https://shop.example/a.png")
  })

  it("does not mistake a word that contains 'icon' or 'star' for an icon", () => {
    expect(productImage(["https://cdn.example/silicone-mould.jpg"])).toBe("https://cdn.example/silicone-mould.jpg")
    expect(productImage(["https://cdn.example/starter-set.jpg"])).toBe("https://cdn.example/starter-set.jpg")
  })

  it("survives a path it cannot decode", () => {
    expect(productImage(["https://cdn.example/%E0%A4%A.jpg"])).toBe("https://cdn.example/%E0%A4%A.jpg")
  })

  it("returns undefined when there is nothing usable", () => {
    expect(productImage(undefined)).toBeUndefined()
    expect(productImage([])).toBeUndefined()
    expect(productImage([42, null, { src: "https://cdn.example/a.jpg" }])).toBeUndefined()
  })
})
