import { describe, expect, it, vi } from "vitest"
import { BuilderLetterContent } from "@/lib/agents/builder"
import { createDraftStream, mergeOverCurrent, parsePartialJson, toCalendarDraft, toLetterDraft } from "@/lib/agents/draft"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { chunksOf } from "./fake-stream"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/client", () => ({ getClient: vi.fn(), agentRequestBase: () => ({}), AGENT_EFFORT: "low" }))

const giftJson = JSON.stringify(BuilderLetterContent.parse(letterFixtures["gift-reveal"]))

describe("parsePartialJson", () => {
  it("reads complete JSON exactly as JSON.parse does", () => {
    expect(parsePartialJson(giftJson)).toEqual(JSON.parse(giftJson))
    expect(parsePartialJson(JSON.stringify(calendarFixtures["advent-classic"]))).toEqual(calendarFixtures["advent-classic"])
    expect(parsePartialJson(' {"a": [1, 2.5, -3e2, true, false, null], "b": {"c": "d"}} ')).toEqual({ a: [1, 2.5, -300, true, false, null], b: { c: "d" } })
  })

  it("never throws on any prefix of a real answer, and each prefix is an object", () => {
    for (let n = 1; n <= giftJson.length; n++) {
      const value = parsePartialJson(giftJson.slice(0, n))
      expect(value && typeof value === "object" && !Array.isArray(value)).toBe(true)
    }
  })

  it("keeps an unfinished string and drops an unfinished key", () => {
    expect(parsePartialJson('{"headline": "Happy bir')).toEqual({ headline: "Happy bir" })
    expect(parsePartialJson('{"headline": "Hi", "bo')).toEqual({ headline: "Hi" })
    expect(parsePartialJson('{"headline": "Hi", "body":')).toEqual({ headline: "Hi" })
    expect(parsePartialJson('{"body": ["One.", "Tw')).toEqual({ body: ["One.", "Tw"] })
  })

  it("decodes escapes and leaves out one that is cut off", () => {
    expect(parsePartialJson('"line one\\nline two \\"quoted\\" caf\\u00e9"')).toBe('line one\nline two "quoted" café')
    expect(parsePartialJson('{"a": "end\\')).toEqual({ a: "end" })
    expect(parsePartialJson('{"a": "caf\\u00')).toEqual({ a: "caf" })
  })

  it("leaves out a number or literal that may still be growing", () => {
    expect(parsePartialJson('{"day": 1')).toEqual({})
    expect(parsePartialJson('{"day": 12,')).toEqual({ day: 12 })
    expect(parsePartialJson("[tr")).toEqual([])
    expect(parsePartialJson("[true")).toEqual([true])
  })

  it("closes nested arrays and objects", () => {
    expect(parsePartialJson('{"gifts": [{"title": "Spa day", "code": "AB')).toEqual({ gifts: [{ title: "Spa day", code: "AB" }] })
    expect(parsePartialJson('{"gifts": [{"title": "Spa day"}, {')).toEqual({ gifts: [{ title: "Spa day" }, {}] })
  })

  it("gives nothing for no text or text that is not JSON", () => {
    expect(parsePartialJson("")).toBeUndefined()
    expect(parsePartialJson("   ")).toBeUndefined()
    expect(parsePartialJson("Sure, here it is")).toBeUndefined()
  })
})

describe("toLetterDraft", () => {
  it("keeps what the draft view shows and never a code, a link, an image, the theme or the gift list", () => {
    const draft = toLetterDraft({
      ...letterFixtures["gift-reveal"],
      wishlist: [{ id: "w1", title: "Pan" }],
      gifts: [{ title: "Spa day", description: "A day off", price: "€90", code: "SECRET-123", url: "https://spa.example", imageUrl: "https://img.example/a.png" }],
    })
    expect(draft).toMatchObject({ recipientName: letterFixtures["gift-reveal"].recipientName, headline: letterFixtures["gift-reveal"].headline })
    expect(draft?.gifts).toEqual([{ title: "Spa day", description: "A day off", price: "€90" }])
    const json = JSON.stringify(draft)
    expect(json).not.toContain("SECRET-123")
    expect(json).not.toContain("https://")
    expect(draft).not.toHaveProperty("theme")
    expect(draft).not.toHaveProperty("wishlist")
  })

  it("drops fields of the wrong type, a gift without a title yet, and paragraphs past six", () => {
    const draft = toLetterDraft({ headline: 5, body: ["a", 2, "b", "c", "d", "e", "f", "g"], gifts: [{}, { title: "Book" }], event: { title: "Party", startsAt: 3 } })
    expect(draft).toEqual({ body: ["a", "b", "c", "d", "e", "f"], gifts: [{ title: "Book" }], event: { title: "Party" } })
  })

  it("is null while there is nothing to show", () => {
    expect(toLetterDraft(undefined)).toBeNull()
    expect(toLetterDraft({})).toBeNull()
    expect(toLetterDraft([])).toBeNull()
  })
})

describe("toCalendarDraft", () => {
  it("keeps doors in order without their numbers, codes or links", () => {
    const draft = toCalendarDraft({
      recipientName: "Anna",
      headline: "24 days",
      startDate: "2026-12-01",
      timezone: "Europe/Berlin",
      doors: [
        { day: 7, title: "One", message: "First" },
        { day: 9, title: "Two", message: "Second", gift: { title: "Tea", code: "TEA-1", url: "https://tea.example" } },
      ],
    })
    expect(draft).toEqual({
      recipientName: "Anna",
      headline: "24 days",
      startDate: "2026-12-01",
      doors: [
        { title: "One", message: "First" },
        { title: "Two", message: "Second", gift: { title: "Tea" } },
      ],
    })
  })
})

describe("mergeOverCurrent", () => {
  const current = { recipientName: "Anna", headline: "Thirty years of you", body: ["One.", "Two.", "Three."], signOff: "Love", gifts: [{ title: "Spa" }] }

  it("keeps the current text while the new text is the start of it", () => {
    expect(mergeOverCurrent(current, { recipientName: "Anna", headline: "Thirty ye" })).toEqual(current)
  })

  it("takes the new text once it differs, and keeps fields it has not reached", () => {
    const merged = mergeOverCurrent(current, { recipientName: "Anna", headline: "Thirty-one" }) as typeof current
    expect(merged.headline).toBe("Thirty-one")
    expect(merged.body).toEqual(current.body)
    expect(merged.gifts).toEqual(current.gifts)
  })

  it("takes a finished field as it is, even when it is shorter", () => {
    const merged = mergeOverCurrent(current, { recipientName: "Anna", headline: "Thirty", body: ["One"] }) as typeof current
    expect(merged.headline).toBe("Thirty")
    // body is still being written: the paragraph is the start of the current one, and the rest stays.
    expect(merged.body).toEqual(["One.", "Two.", "Three."])
  })

  it("keeps showing current items until the list is finished, then only the new ones", () => {
    const writing = mergeOverCurrent(current, { recipientName: "Anna", headline: "Thirty years of you", body: ["New one.", "New tw"] }) as typeof current
    expect(writing.body).toEqual(["New one.", "New tw", "Three."])
    const finished = mergeOverCurrent(current, { recipientName: "Anna", headline: "Thirty years of you", body: ["New one.", "New two."], signOff: "Lo" }) as typeof current
    expect(finished.body).toEqual(["New one.", "New two."])
    expect(finished.signOff).toBe("Love")
  })
})

describe("createDraftStream", () => {
  function setup(intervalMs = 250) {
    let clock = 0
    const sent: unknown[] = []
    const sink = createDraftStream({ shape: toLetterDraft, emit: (d) => sent.push(d), intervalMs, now: () => clock })
    return { sink, sent, tick: (ms: number) => (clock += ms) }
  }

  it("sends at most one draft per interval, and the rest on flush", () => {
    const { sink, sent, tick } = setup()
    // 40 pieces, 50 ms apart: two seconds of streaming.
    for (const piece of chunksOf(giftJson, 12).slice(0, 40)) {
      sink.push(piece)
      tick(50)
    }
    expect(sent.length).toBeGreaterThanOrEqual(7)
    expect(sent.length).toBeLessThanOrEqual(9)
    const before = sent.length
    sink.flush()
    expect(sent.length).toBe(before + 1)
  })

  it("sends the first piece at once and never the same draft twice", () => {
    const { sink, sent, tick } = setup()
    sink.push('{"headline": "Hi"')
    expect(sent).toEqual([{ headline: "Hi" }])
    tick(1000)
    sink.push(", ")
    sink.flush()
    expect(sent).toHaveLength(1)
  })

  it("shows the whole answer in reading order: headline, then paragraphs, then gifts", () => {
    const { sink, sent, tick } = setup(0)
    for (const piece of chunksOf(giftJson, 7)) {
      sink.push(piece)
      tick(1)
    }
    sink.flush()
    const firstWith = (key: string) => sent.findIndex((d) => key in (d as object))
    expect(firstWith("headline")).toBeGreaterThan(-1)
    expect(firstWith("headline")).toBeLessThan(firstWith("body"))
    expect(firstWith("body")).toBeLessThan(firstWith("gifts"))
    expect(sent.at(-1)).toEqual(toLetterDraft(JSON.parse(giftJson)))
  })

  it("starts again after a restart", () => {
    const { sink, sent } = setup()
    sink.push('{"headline": "First"}')
    sink.restart()
    sink.push('{"headline": "First"}')
    expect(sent).toEqual([{ headline: "First" }, { headline: "First" }])
  })

  it("never throws when shaping fails", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const sink = createDraftStream({
      shape: () => {
        throw new Error("bad")
      },
      emit: () => {},
    })
    expect(() => {
      sink.push("{")
      sink.flush()
    }).not.toThrow()
    error.mockRestore()
  })
})
