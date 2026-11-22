import { describe, expect, it } from "vitest"
import {
  ADVENT_DOORS,
  calendarProgress,
  countdownStart,
  defaultAdventStart,
  defaultCover,
  doorCount,
  doorFilled,
  emptyDoors,
  giftFromOption,
  initialContent,
  isIsoDate,
  mergeNotes,
  optionForGift,
  ownGift,
  setDoor,
  shareReady,
} from "@/lib/calendars/doors"
import type { GiftOption } from "@/lib/finder/events"
import { CalendarContent } from "@/lib/letters/schema"

const OPTION: GiftOption = {
  id: "o1",
  title: "Lavendel-Badesalz",
  description: "Ein Badesalz mit Lavendel aus der Provence.",
  reason: "Sie liebt lange Bäder.",
  price: "8,90 €",
  url: "https://seife.example/lavendel",
  imageUrl: "https://seife.example/lavendel.jpg",
  shop: "Seifenmanufaktur",
}

function advent() {
  return initialContent({
    templateId: "advent-classic",
    recipientName: "Anna",
    senderName: "Javier",
    startDate: "2026-12-01",
    timezone: "Europe/Berlin",
  })
}

describe("a new calendar", () => {
  it("has 24 empty doors for advent-classic and validates against the contract", () => {
    const content = advent()
    expect(content.doors).toHaveLength(ADVENT_DOORS)
    expect(content.doors[0]).toEqual({ day: 1, title: "", message: "" })
    expect(content.headline).toBe("24 doors for Anna")
    expect(CalendarContent.safeParse(content).success).toBe(true)
  })

  it("has the chosen number of days for a countdown, 1 to 31", () => {
    expect(doorCount("countdown", 10)).toBe(10)
    expect(doorCount("countdown", 0)).toBe(7)
    expect(doorCount("countdown", 40)).toBe(31)
    expect(doorCount("advent-classic", 10)).toBe(24)
  })

  it("opens on 1 December, or next year's once Christmas has passed", () => {
    expect(defaultAdventStart(new Date("2026-11-22T10:00:00Z"), "Europe/Berlin")).toBe("2026-12-01")
    expect(defaultAdventStart(new Date("2026-12-10T10:00:00Z"), "Europe/Berlin")).toBe("2026-12-01")
    expect(defaultAdventStart(new Date("2026-12-26T10:00:00Z"), "Europe/Berlin")).toBe("2027-12-01")
  })

  it("counts a countdown back from the big day", () => {
    expect(countdownStart("2026-12-24", 7)).toBe("2026-12-18")
    expect(countdownStart("2027-03-01", 3)).toBe("2027-02-27")
    expect(isIsoDate("2026-02-30")).toBe(false)
  })
})

describe("progress and the share gate", () => {
  it("counts a door with a gift or a note as filled, and nothing else", () => {
    expect(doorFilled({ day: 1, title: "", message: "" })).toBe(false)
    expect(doorFilled({ day: 1, title: "Only a title", message: "  " })).toBe(false)
    expect(doorFilled({ day: 1, title: "", message: "A note" })).toBe(true)
    expect(doorFilled({ day: 1, title: "", message: "", gift: { title: "Tea" } })).toBe(true)
  })

  it("reports 14 of 24 and opens sharing only when every door is filled", () => {
    let content = advent()
    for (let day = 1; day <= 14; day++) content = setDoor(content, day, { title: "", message: `Note ${day}` })!
    expect(calendarProgress(content)).toEqual({ filled: 14, total: 24 })
    expect(shareReady(content)).toBe(false)
    for (let day = 15; day <= 24; day++) content = setDoor(content, day, { gift: giftFromOption(OPTION), title: "", message: "" })!
    expect(calendarProgress(content)).toEqual({ filled: 24, total: 24 })
    expect(shareReady(content)).toBe(true)
    expect(shareReady({ doors: emptyDoors(0) })).toBe(false)
  })
})

describe("gifts behind doors", () => {
  it("copies a picked idea exactly, without its shop image", () => {
    expect(giftFromOption(OPTION)).toEqual({
      title: "Lavendel-Badesalz",
      description: "Ein Badesalz mit Lavendel aus der Provence.",
      url: "https://seife.example/lavendel",
      price: "8,90 €",
    })
  })

  it("drops a link that is not https", () => {
    expect(giftFromOption({ ...OPTION, url: "javascript:alert(1)" }).url).toBeUndefined()
  })

  it("accepts the sender's own gift with a code and an https link only", () => {
    expect(ownGift({ title: "  Kino für zwei ", code: " ABC 123 ", url: "https://kino.example/g" })).toEqual({
      ok: true,
      gift: { title: "Kino für zwei", code: "ABC 123", url: "https://kino.example/g" },
    })
    expect(ownGift({ title: "  " })).toEqual({ ok: false, problem: "title" })
    expect(ownGift({ title: "Tea", url: "http://tea.example" })).toEqual({ ok: false, problem: "url" })
    expect(ownGift({ title: "Tea", url: "data:text/html,hi" })).toEqual({ ok: false, problem: "url" })
  })

  it("finds the idea a door's gift came from by its link", () => {
    expect(optionForGift(giftFromOption(OPTION), [OPTION])?.id).toBe("o1")
    expect(optionForGift({ title: "Own" }, [OPTION])).toBeUndefined()
  })

  it("replaces only the chosen door and refuses a door the calendar does not have", () => {
    const content = setDoor(advent(), 3, { gift: { title: "Tea" }, title: " Day   three ", message: " Warm up. \n" })!
    expect(content.doors[2]).toEqual({ day: 3, title: "Day three", message: "Warm up.", gift: { title: "Tea" } })
    expect(content.doors[1]).toEqual({ day: 2, title: "", message: "" })
    expect(setDoor(advent(), 25, { title: "", message: "x" })).toBeNull()
  })
})

describe("Majnu's notes", () => {
  it("fills only empty notes, keeps the sender's notes and every gift, and replaces a default headline", () => {
    let current = advent()
    current = setDoor(current, 1, { gift: { title: "Tea", url: "https://tea.example" }, title: "", message: "" })!
    current = setDoor(current, 2, { title: "Mine", message: "I wrote this." })!
    const written = {
      headline: "24 Türchen für dich",
      intro: "Jeden Tag ein kleines Licht.",
      doors: current.doors.map((door) => ({ day: door.day, title: `Builder ${door.day}`, message: `Builder note ${door.day}`, gift: { title: "Invented" } })),
    }
    const merged = mergeNotes(current, written, "advent-classic")
    expect(merged.written).toBe(23)
    expect(merged.content.doors[0]).toEqual({ day: 1, title: "Builder 1", message: "Builder note 1", gift: { title: "Tea", url: "https://tea.example" } })
    expect(merged.content.doors[1]).toEqual({ day: 2, title: "Mine", message: "I wrote this." })
    expect(merged.content.doors[2].gift).toBeUndefined()
    expect(merged.content.headline).toBe("24 Türchen für dich")
    expect(merged.content.intro).toBe("Jeden Tag ein kleines Licht.")
  })

  it("keeps a headline the sender changed", () => {
    const current = { ...advent(), headline: "For my favourite person" }
    const merged = mergeNotes(current, { headline: "New", intro: "New", doors: [] }, "advent-classic")
    expect(merged.content.headline).toBe("For my favourite person")
    expect(merged.written).toBe(0)
  })

  it("uses a countdown's own default cover", () => {
    expect(defaultCover("Tom", 1, "countdown").headline).toBe("One day to go, Tom")
    expect(defaultCover("Tom", 5, "countdown").headline).toBe("5 days to go, Tom")
  })
})
