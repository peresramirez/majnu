import { describe, expect, it } from "vitest"
import type { ChatEvent } from "@/lib/agents/events"
import { createEventStream, encodeEvent } from "@/lib/agents/ndjson"

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text()
}

describe("encodeEvent", () => {
  it("writes one JSON object per line, even when the text has newlines", () => {
    const line = encodeEvent({ type: "text", delta: "Dear Anna,\n\nHappy birthday." })
    expect(line.endsWith("\n")).toBe(true)
    expect(line.slice(0, -1)).not.toContain("\n")
    expect(JSON.parse(line)).toEqual({ type: "text", delta: "Dear Anna,\n\nHappy birthday." })
  })
})

describe("createEventStream", () => {
  it("streams events in order as newline-delimited JSON", async () => {
    const events: ChatEvent[] = [
      { type: "letter", letterId: "abc" },
      { type: "text", delta: "Hello" },
      { type: "tool", name: "build_letter", status: "start", label: "Writing your letter…" },
      { type: "preview", letterId: "abc", kind: "letter", templateId: "classic-envelope" },
      { type: "done" },
    ]
    const out = createEventStream()
    for (const event of events) out.emit(event)
    out.close()

    const lines = (await readAll(out.stream)).split("\n")
    expect(lines.pop()).toBe("")
    expect(lines.map((line) => JSON.parse(line))).toEqual(events)
  })

  it("drops events after close instead of throwing", async () => {
    const out = createEventStream()
    out.emit({ type: "done" })
    out.close()
    expect(() => out.emit({ type: "text", delta: "late" })).not.toThrow()
    expect(await readAll(out.stream)).toBe('{"type":"done"}\n')
  })

  it("marks itself closed when the client goes away", async () => {
    const out = createEventStream()
    await out.stream.cancel()
    expect(out.closed).toBe(true)
    expect(() => out.emit({ type: "done" })).not.toThrow()
  })
})
