import { describe, expect, it } from "vitest"
import { audioNotFound, audioResponse } from "@/lib/audio/serve"

const bytes = Uint8Array.from({ length: 1000 }, (_, i) => i % 256)
const file = { body: new Blob([bytes], { type: "audio/mp4" }), mimeType: "audio/mp4", version: "22222222-2222-4222-8222-222222222222" }

function get(headers: Record<string, string> = {}, method = "GET") {
  return new Request("http://localhost:3000/l/AbCdEf7890/audio", { method, headers })
}

async function body(res: Response) {
  return new Uint8Array(await res.arrayBuffer())
}

describe("audioResponse", () => {
  it("sends the whole file with the headers every answer carries", async () => {
    const res = audioResponse(get(), file)
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("audio/mp4")
    expect(res.headers.get("content-length")).toBe("1000")
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("cache-control")).toBe("private, max-age=300")
    expect(res.headers.get("cache-control")).not.toMatch(/public|s-maxage/)
    expect(res.headers.get("etag")).toBe('"22222222-2222-4222-8222-222222222222"')
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin")
    expect(res.headers.get("x-content-type-options")).toBe("nosniff")
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow")
    expect(await body(res)).toEqual(bytes)
  })

  it("answers Safari's first probe, bytes=0-1, with 206 and two bytes", async () => {
    const res = audioResponse(get({ range: "bytes=0-1" }), file)
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 0-1/1000")
    expect(res.headers.get("content-length")).toBe("2")
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(await body(res)).toEqual(bytes.slice(0, 2))
  })

  it("answers a middle range and an open-ended one with exactly those bytes", async () => {
    const middle = audioResponse(get({ range: "bytes=100-199" }), file)
    expect(middle.status).toBe(206)
    expect(middle.headers.get("content-range")).toBe("bytes 100-199/1000")
    expect(await body(middle)).toEqual(bytes.slice(100, 200))

    const rest = audioResponse(get({ range: "bytes=990-" }), file)
    expect(rest.status).toBe(206)
    expect(rest.headers.get("content-range")).toBe("bytes 990-999/1000")
    expect(rest.headers.get("content-length")).toBe("10")
    expect(await body(rest)).toEqual(bytes.slice(990))
  })

  it("answers a suffix range", async () => {
    const res = audioResponse(get({ range: "bytes=-4" }), file)
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 996-999/1000")
    expect(await body(res)).toEqual(bytes.slice(996))
  })

  it("answers 416 with the file's size when the range starts past the end", async () => {
    const res = audioResponse(get({ range: "bytes=1000-" }), file)
    expect(res.status).toBe(416)
    expect(res.headers.get("content-range")).toBe("bytes */1000")
    expect((await body(res)).length).toBe(0)
  })

  it("sends the whole file for several ranges or a changed file (If-Range)", async () => {
    expect(audioResponse(get({ range: "bytes=0-1,4-5" }), file).status).toBe(200)
    expect(audioResponse(get({ range: "bytes=0-1", "if-range": '"an-older-version"' }), file).status).toBe(200)
    expect(audioResponse(get({ range: "bytes=0-1", "if-range": '"22222222-2222-4222-8222-222222222222"' }), file).status).toBe(206)
  })

  it("answers HEAD with the headers and no body", async () => {
    const res = audioResponse(get({ range: "bytes=0-1" }, "HEAD"), file)
    expect(res.status).toBe(206)
    expect(res.headers.get("content-length")).toBe("2")
    expect(res.body).toBeNull()
  })
})

describe("audioNotFound", () => {
  it("is plain text that is never cached and says nothing about the letter", async () => {
    const res = audioNotFound()
    expect(res.status).toBe(404)
    expect(res.headers.get("cache-control")).toBe("no-store")
    expect(await res.text()).toBe("Not found")
  })
})
