import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { imageFromHtml, pageImage, withPageImages } from "@/lib/agents/page-image"

const page = (head: string) => `<!doctype html><html><head>${head}</head><body>${"x".repeat(50)}</body></html>`

function fakeFetch(body: string, init: { status?: number; type?: string; url?: string } = {}): typeof fetch {
  return vi.fn(async () => {
    const response = new Response(body, { status: init.status ?? 200, headers: { "content-type": init.type ?? "text/html; charset=utf-8" } })
    Object.defineProperty(response, "url", { value: init.url ?? "https://shop.example/p/1" })
    return response
  }) as unknown as typeof fetch
}

describe("imageFromHtml", () => {
  it("reads og:image in either attribute order, made absolute and decoded", () => {
    expect(imageFromHtml(page('<meta property="og:image" content="https://cdn.example/products/kettle.jpg">'), "https://shop.example/p/1")).toBe(
      "https://cdn.example/products/kettle.jpg",
    )
    expect(imageFromHtml(page("<meta content='/media/kettle.webp?w=800&amp;h=600' property='og:image' />"), "https://shop.example/p/1")).toBe(
      "https://shop.example/media/kettle.webp?w=800&h=600",
    )
    expect(imageFromHtml(page('<meta name="twitter:image" content="https://cdn.example/files/a.jpg">'), "https://shop.example/")).toBe("https://cdn.example/files/a.jpg")
  })

  it("skips logos, http images and pages without one", () => {
    expect(imageFromHtml(page('<meta property="og:image" content="https://shop.example/assets/logo.png">'), "https://shop.example/")).toBeUndefined()
    expect(imageFromHtml(page('<meta property="og:image" content="http://shop.example/products/a.jpg">'), "http://shop.example/")).toBeUndefined()
    expect(imageFromHtml(page("<title>Shop</title>"), "https://shop.example/")).toBeUndefined()
  })
})

describe("pageImage", () => {
  it("fetches the page and returns its preview image", async () => {
    const fetchImpl = fakeFetch(page('<meta property="og:image" content="https://cdn.example/products/k.jpg">'))
    expect(await pageImage("https://shop.example/p/1", fetchImpl)).toBe("https://cdn.example/products/k.jpg")
  })

  it("gives nothing for errors, non-HTML, http links and failed fetches", async () => {
    expect(await pageImage("https://shop.example/p/1", fakeFetch("no", { status: 403 }))).toBeUndefined()
    expect(await pageImage("https://shop.example/p/1", fakeFetch("{}", { type: "application/json" }))).toBeUndefined()
    const never = vi.fn() as unknown as typeof fetch
    expect(await pageImage("http://shop.example/p/1", never)).toBeUndefined()
    expect(never).not.toHaveBeenCalled()
    const failing = vi.fn(async () => {
      throw new Error("timeout")
    }) as unknown as typeof fetch
    expect(await pageImage("https://shop.example/p/1", failing)).toBeUndefined()
  })
})

describe("withPageImages", () => {
  it("fills only ideas with a link and no photo", async () => {
    const fetchImpl = fakeFetch(page('<meta property="og:image" content="https://cdn.example/products/k.jpg">'))
    const ideas = await withPageImages(
      [
        { url: "https://shop.example/a", imageUrl: "https://cdn.example/products/kept.jpg" },
        { url: "https://shop.example/b" },
        { title: "no link" } as { url?: string; imageUrl?: string },
      ],
      fetchImpl,
    )
    expect(ideas.map((idea) => idea.imageUrl)).toEqual(["https://cdn.example/products/kept.jpg", "https://cdn.example/products/k.jpg", undefined])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
