import { describe, expect, it } from "vitest"
import { parseFinderEvent, readFinderEvents, splitLines } from "@/components/finder/ndjson"
import type { FinderEvent } from "@/lib/finder/events"

function streamOf(chunks: (string | Uint8Array)[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk)
      controller.close()
    },
  })
}

async function collect(stream: ReadableStream<Uint8Array>): Promise<FinderEvent[]> {
  const events: FinderEvent[] = []
  for await (const event of readFinderEvents(stream)) events.push(event)
  return events
}

const option = { id: "a", title: "Apron", description: "Linen", reason: "She bakes", url: "https://shop.example/a" }

describe("splitLines", () => {
  it("keeps an unfinished line as the rest", () => {
    expect(splitLines('{"type":"done"}\n{"type":"te')).toEqual({ lines: ['{"type":"done"}'], rest: '{"type":"te' })
  })

  it("drops blank lines and handles CRLF", () => {
    expect(splitLines('{"a":1}\r\n\r\n\n{"b":2}\r\n')).toEqual({ lines: ['{"a":1}', '{"b":2}'], rest: "" })
  })
})

describe("parseFinderEvent", () => {
  it("reads every event type of the contract", () => {
    expect(parseFinderEvent('{"type":"session","sessionId":"s1"}')).toEqual({ type: "session", sessionId: "s1" })
    expect(parseFinderEvent('{"type":"text","delta":"Hi"}')).toEqual({ type: "text", delta: "Hi" })
    expect(parseFinderEvent('{"type":"status","label":"Looking…"}')).toEqual({ type: "status", label: "Looking…" })
    expect(parseFinderEvent('{"type":"context","context":{"language":"de","country":"DE"}}')).toEqual({
      type: "context",
      context: { language: "de", country: "DE" },
    })
    expect(parseFinderEvent(JSON.stringify({ type: "options", options: [option], recommendedId: "a", why: "Because" }))).toEqual({
      type: "options",
      options: [option],
      recommendedId: "a",
      why: "Because",
    })
    expect(parseFinderEvent('{"type":"question","text":"How old?","suggestions":["40","60"]}')).toEqual({
      type: "question",
      text: "How old?",
      suggestions: ["40", "60"],
    })
    // Issue #82: the label for the combined answer, and whether a profile was read.
    expect(parseFinderEvent('{"type":"question","text":"Free time?","label":"Free time","suggestions":["Gaming"],"profileRead":true}')).toEqual({
      type: "question",
      text: "Free time?",
      label: "Free time",
      suggestions: ["Gaming"],
      profileRead: true,
    })
    expect(parseFinderEvent('{"type":"question","text":"Free time?","label":" ","profileRead":"yes"}')).toEqual({ type: "question", text: "Free time?" })
    expect(parseFinderEvent('{"type":"limit","reason":"finder_daily","message":"Tomorrow"}')).toEqual({
      type: "limit",
      reason: "finder_daily",
      message: "Tomorrow",
    })
    expect(parseFinderEvent('{"type":"error","message":"Oh"}')).toEqual({ type: "error", message: "Oh" })
    expect(parseFinderEvent('{"type":"done"}')).toEqual({ type: "done" })
  })

  it("reads Majnu's fill for the wrap form, only its four text fields (issue #70)", () => {
    expect(parseFinderEvent('{"type":"fill","fields":{"recipientName":"Ana","senderName":"Javi","giftCode":"GC-1","other":"x"}}')).toEqual({
      type: "fill",
      fields: { recipientName: "Ana", senderName: "Javi", giftCode: "GC-1" },
    })
    expect(parseFinderEvent('{"type":"fill","fields":{"note":42,"recipientName":"  "}}')).toBeNull()
    expect(parseFinderEvent('{"type":"fill"}')).toBeNull()
  })

  it("reads the new limit reason for a full session", () => {
    expect(parseFinderEvent('{"type":"limit","reason":"session_full","message":"Start a new search."}')).toEqual({
      type: "limit",
      reason: "session_full",
      message: "Start a new search.",
    })
  })

  it("skips bad lines instead of throwing", () => {
    expect(parseFinderEvent("not json")).toBeNull()
    expect(parseFinderEvent("[1,2]")).toBeNull()
    expect(parseFinderEvent('{"type":"mystery"}')).toBeNull()
    expect(parseFinderEvent('{"type":"session","sessionId":""}')).toBeNull()
    expect(parseFinderEvent('{"type":"text"}')).toBeNull()
    expect(parseFinderEvent('{"type":"limit","reason":"made_up","message":"x"}')).toBeNull()
  })

  it("drops malformed options and keeps the good ones", () => {
    const event = parseFinderEvent(
      JSON.stringify({ type: "options", options: [option, { id: "b" }, { title: "no id", url: "https://x" }], recommendedId: "a" }),
    )
    expect(event).toEqual({ type: "options", options: [option], recommendedId: "a", why: "" })
    expect(parseFinderEvent(JSON.stringify({ type: "options", options: [{ id: "b" }] }))).toBeNull()
  })

  it("fills a missing description or reason with empty text", () => {
    const event = parseFinderEvent(JSON.stringify({ type: "options", options: [{ id: "a", title: "T", url: "https://x" }], recommendedId: "a" }))
    expect(event).toMatchObject({ options: [{ description: "", reason: "" }] })
  })

  it("drops empty suggestions and omits the list when none are left", () => {
    expect(parseFinderEvent('{"type":"question","text":"Name?","suggestions":["", 3]}')).toEqual({ type: "question", text: "Name?" })
  })

  it("keeps an error without a message, so the default text is shown", () => {
    expect(parseFinderEvent('{"type":"error"}')).toEqual({ type: "error", message: "" })
  })
})

describe("readFinderEvents", () => {
  it("reads events split across chunks, including a final line without a newline", async () => {
    const events = await collect(streamOf(['{"type":"sess', 'ion","sessionId":"s1"}\n{"type":"text","delta":"Hé', 'llo"}\n', '{"type":"done"}']))
    expect(events).toEqual([
      { type: "session", sessionId: "s1" },
      { type: "text", delta: "Héllo" },
      { type: "done" },
    ])
  })

  it("decodes a multi-byte character split between chunks", async () => {
    const bytes = new TextEncoder().encode('{"type":"text","delta":"€"}\n')
    const cut = bytes.indexOf(0xe2) + 1
    const events = await collect(streamOf([bytes.slice(0, cut), bytes.slice(cut)]))
    expect(events).toEqual([{ type: "text", delta: "€" }])
  })

  it("skips a garbled line and carries on", async () => {
    const events = await collect(streamOf(['{"type":"text","delta":"a"}\n{oops\n{"type":"done"}\n']))
    expect(events).toEqual([{ type: "text", delta: "a" }, { type: "done" }])
  })

  it("cancels the download when the reader stops early", async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"type":"text","delta":"a"}\n'))
      },
      cancel() {
        cancelled = true
      },
    })
    for await (const event of readFinderEvents(stream)) {
      expect(event).toEqual({ type: "text", delta: "a" })
      break
    }
    expect(cancelled).toBe(true)
  })
})
