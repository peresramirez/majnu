import { describe, expect, it } from "vitest"
import { parseChatEvent, readChatEvents, splitLines } from "@/components/create/ndjson"
import type { ChatEvent } from "@/lib/agents/events"

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk)
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<ChatEvent[]> {
  const events: ChatEvent[] = []
  for await (const event of readChatEvents(stream)) events.push(event)
  return events
}

describe("splitLines", () => {
  it("keeps an unfinished line as the rest", () => {
    expect(splitLines('{"type":"done"}\n{"type":"te')).toEqual({ lines: ['{"type":"done"}'], rest: '{"type":"te' })
  })

  it("drops blank lines and handles CRLF", () => {
    expect(splitLines('{"a":1}\r\n\r\n\n{"b":2}\r\n')).toEqual({ lines: ['{"a":1}', '{"b":2}'], rest: "" })
  })
})

describe("parseChatEvent", () => {
  it("reads every event type in the contract", () => {
    const lines: ChatEvent[] = [
      { type: "letter", letterId: "abc" },
      { type: "text", delta: "Hello" },
      { type: "tool", name: "research_gifts", status: "start", label: "Looking for gift ideas…" },
      { type: "templates", ids: ["classic-envelope", "postcard"] },
      { type: "gifts", ideas: [{ title: "Spa day", reason: "She loves saunas", price: "€90" }] },
      { type: "preview", letterId: "abc", kind: "letter", templateId: "classic-envelope" },
      { type: "draft", letterId: "abc", kind: "letter", templateId: "classic-envelope", content: { headline: "For you", body: ["One"] } },
      { type: "draft", letterId: "abc", kind: "calendar", templateId: "countdown", content: { doors: [{ title: "Day one" }] } },
      { type: "limit", reason: "full_moon_only", message: "Advent calendars are part of Full moon." },
      { type: "refusal", message: "Try again" },
      { type: "error", message: "Something went wrong" },
      { type: "done" },
    ]
    for (const event of lines) expect(parseChatEvent(JSON.stringify(event))).toEqual(event)
  })

  it("skips lines that are not JSON, unknown types and events missing their fields", () => {
    expect(parseChatEvent("not json")).toBeNull()
    expect(parseChatEvent("[1,2]")).toBeNull()
    expect(parseChatEvent('{"type":"ping"}')).toBeNull()
    expect(parseChatEvent('{"type":"text"}')).toBeNull()
    expect(parseChatEvent('{"type":"letter","letterId":""}')).toBeNull()
    expect(parseChatEvent('{"type":"templates","ids":"classic-envelope"}')).toBeNull()
    expect(parseChatEvent('{"type":"gifts","ideas":[{"reason":"no title"}]}')).toBeNull()
    expect(parseChatEvent('{"type":"draft","letterId":"abc","kind":"letter","templateId":"postcard"}')).toBeNull()
    expect(parseChatEvent('{"type":"draft","letterId":"abc","kind":"poem","templateId":"postcard","content":{}}')).toBeNull()
    expect(parseChatEvent('{"type":"draft","letterId":"abc","kind":"letter","templateId":"postcard","content":["x"]}')).toBeNull()
  })

  it("keeps a refusal or error without a message, so the UI can use its own words", () => {
    expect(parseChatEvent('{"type":"error"}')).toEqual({ type: "error", message: "" })
  })
})

describe("readChatEvents", () => {
  it("reassembles lines split across chunks", async () => {
    const events = await collect(
      streamOf(['{"type":"letter","let', 'terId":"abc"}\n{"type":"text","delta":"Hi"}\n{"type":', '"done"}\n']),
    )
    expect(events).toEqual([{ type: "letter", letterId: "abc" }, { type: "text", delta: "Hi" }, { type: "done" }])
  })

  it("reads a last line without a trailing newline", async () => {
    expect(await collect(streamOf(['{"type":"text","delta":"a"}\n{"type":"done"}']))).toEqual([
      { type: "text", delta: "a" },
      { type: "done" },
    ])
  })

  it("decodes a multi-byte character split between chunks", async () => {
    const bytes = new TextEncoder().encode('{"type":"text","delta":"Für dich 🌙"}\n')
    const cut = bytes.indexOf(0xf0) + 2 // inside the four-byte moon
    const events = await collect(streamOf([bytes.slice(0, cut), bytes.slice(cut)]))
    expect(events).toEqual([{ type: "text", delta: "Für dich 🌙" }])
  })

  it("skips a malformed line and keeps reading", async () => {
    const events = await collect(streamOf(['{"type":"text","delta":"a"}\n{oops\n{"type":"done"}\n']))
    expect(events).toEqual([{ type: "text", delta: "a" }, { type: "done" }])
  })

  it("cancels the stream when the reader stops early", async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"text","delta":"x"}\n'))
      },
      cancel() {
        cancelled = true
      },
    })
    for await (const event of readChatEvents(stream)) {
      expect(event.type).toBe("text")
      break
    }
    expect(cancelled).toBe(true)
  })
})
