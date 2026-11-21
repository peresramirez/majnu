import { describe, expect, it } from "vitest"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { calendarDate, doorOpensOn, toPublicView } from "@/lib/letters/public-view"
import type { CalendarContent, LetterRecord, PublicDoor, PublicLetter } from "@/lib/letters/schema"

const advent = calendarFixtures["advent-classic"] // starts 2026-12-01, Europe/Berlin, 24 doors

function record(overrides: Partial<LetterRecord>): LetterRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    ownerId: "owner",
    slug: "abcdefghij",
    kind: "calendar",
    templateId: "advent-classic",
    title: null,
    content: advent,
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    ...overrides,
  }
}

function calendarView(content: CalendarContent, now: string, ownerPreview = false) {
  const view = toPublicView(record({ content }), new Date(now), { ownerPreview })
  if (!view || view.kind !== "calendar") throw new Error("expected a calendar view")
  return view
}

const openDays = (doors: PublicDoor[]) => doors.filter((d) => !d.locked).map((d) => d.day)

describe("toPublicView: calendar door locking", () => {
  it("keeps every door locked until midnight in Berlin", () => {
    // 23:59:59 on 30 November in Berlin (UTC+1).
    const view = calendarView(advent, "2026-11-30T22:59:59Z")
    expect(view.content.doors).toHaveLength(24)
    expect(openDays(view.content.doors)).toEqual([])
  })

  it("opens door 1 at midnight in Berlin and keeps door 2 locked", () => {
    const view = calendarView(advent, "2026-11-30T23:00:00Z")
    expect(openDays(view.content.doors)).toEqual([1])
    expect(view.content.doors[1]).toEqual({ day: 2, locked: true, opensOn: "2026-12-02" })
  })

  it("opens one more door each day", () => {
    const view = calendarView(advent, "2026-12-06T12:00:00Z")
    expect(openDays(view.content.doors)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("uses the calendar's own timezone: Auckland opens 10 hours before Berlin", () => {
    const auckland = { ...advent, timezone: "Pacific/Auckland" } // UTC+13 in December
    expect(openDays(calendarView(auckland, "2026-11-30T10:59:59Z").content.doors)).toEqual([])
    expect(openDays(calendarView(auckland, "2026-11-30T11:00:00Z").content.doors)).toEqual([1])
    // The same instant is still 30 November in Berlin.
    expect(openDays(calendarView(advent, "2026-11-30T11:00:00Z").content.doors)).toEqual([])
  })

  it("locked doors carry only day, locked and opensOn", () => {
    const view = calendarView(advent, "2026-12-01T12:00:00Z")
    for (const door of view.content.doors.filter((d) => d.locked)) {
      expect(Object.keys(door).sort()).toEqual(["day", "locked", "opensOn"])
    }
    const json = JSON.stringify(view)
    // Door 2's message and door 6's gift code must not be in what reaches the browser.
    expect(json).not.toContain(advent.doors[1].message)
    expect(json).not.toContain("RSCH-NIKO-06")
    expect(json).not.toContain("Chocolate from Rausch")
    expect(json).toContain(advent.doors[0].message)
  })

  it("open doors carry their title, message and gift", () => {
    const view = calendarView(advent, "2026-12-06T08:00:00Z")
    expect(view.content.doors[5]).toMatchObject({
      day: 6,
      locked: false,
      opensOn: "2026-12-06",
      title: "Day 6",
      gift: { code: "RSCH-NIKO-06" },
    })
  })

  it("opens every door in the owner's preview, even before the start date", () => {
    const view = calendarView(advent, "2026-11-21T12:00:00Z", true)
    expect(view.ownerPreview).toBe(true)
    expect(openDays(view.content.doors)).toHaveLength(24)
    expect(view.content.doors[23]).toMatchObject({ day: 24, locked: false, opensOn: "2026-12-24" })
  })

  it("counts opening dates across month ends and leap days", () => {
    expect(doorOpensOn("2027-02-27", 3)).toBe("2027-03-01")
    expect(doorOpensOn("2028-02-28", 2)).toBe("2028-02-29")
    expect(doorOpensOn("2026-12-31", 2)).toBe("2027-01-01")
  })

  it("is not shifted by a daylight-saving change", () => {
    // Berlin moves to summer time on 28 March 2027.
    const spring: CalendarContent = { ...calendarFixtures.countdown, startDate: "2027-03-27" }
    const view = calendarView(spring, "2027-03-28T22:30:00Z") // 00:30 on 29 March in Berlin
    expect(view.content.doors.map((d) => [d.day, d.opensOn, d.locked])).toEqual([
      [1, "2027-03-27", false],
      [2, "2027-03-28", false],
      [3, "2027-03-29", false],
      [4, "2027-03-30", true],
      [5, "2027-03-31", true],
      [6, "2027-04-01", true],
      [7, "2027-04-02", true],
    ])
  })

  it("drops fields that are not in the schema", () => {
    const tampered = {
      ...advent,
      secret: "do not ship",
      doors: advent.doors.map((d) => ({ ...d, note: "hidden" })),
    } as unknown as CalendarContent
    const json = JSON.stringify(calendarView(tampered, "2026-12-24T12:00:00Z"))
    expect(json).not.toContain("do not ship")
    expect(json).not.toContain("hidden")
  })

  it("falls back to UTC for an unknown timezone", () => {
    const broken = { ...advent, timezone: "Mars/Olympus_Mons" }
    expect(openDays(calendarView(broken, "2026-11-30T23:30:00Z").content.doors)).toEqual([])
    expect(openDays(calendarView(broken, "2026-12-01T00:00:00Z").content.doors)).toEqual([1])
  })
})

describe("toPublicView: letters and invalid records", () => {
  it("passes a letter through unchanged", () => {
    const content = letterFixtures["gift-reveal"]
    const view = toPublicView(record({ kind: "letter", templateId: "gift-reveal", content }), new Date(), {
      ownerPreview: false,
    })
    expect(view).toEqual<PublicLetter>({
      kind: "letter",
      slug: "abcdefghij",
      templateId: "gift-reveal",
      content,
      ownerPreview: false,
    })
  })

  it("returns null when content or template is missing", () => {
    expect(toPublicView(record({ content: null }), new Date(), { ownerPreview: false })).toBeNull()
    expect(toPublicView(record({ templateId: null }), new Date(), { ownerPreview: true })).toBeNull()
  })

  it("returns null when the template belongs to the other kind", () => {
    expect(toPublicView(record({ templateId: "classic-envelope" }), new Date(), { ownerPreview: false })).toBeNull()
    expect(
      toPublicView(record({ kind: "letter", templateId: "advent-classic", content: letterFixtures.postcard }), new Date(), {
        ownerPreview: false,
      }),
    ).toBeNull()
  })

  it("returns null when the content does not match the schema", () => {
    const content = { recipientName: "Anna" } as unknown as CalendarContent
    expect(toPublicView(record({ content }), new Date(), { ownerPreview: false })).toBeNull()
    const badDate = { ...advent, startDate: "1 December" }
    expect(toPublicView(record({ content: badDate }), new Date(), { ownerPreview: false })).toBeNull()
  })

  it("drops gift links that are not https", () => {
    const content = {
      ...letterFixtures["gift-reveal"],
      gifts: [
        { title: "A", url: "javascript:alert(1)", imageUrl: "data:image/png;base64,AAAA" },
        { title: "B", url: "https://example.com/b", imageUrl: "https://example.com/b.png" },
      ],
    }
    const view = toPublicView(record({ kind: "letter", templateId: "gift-reveal", content }), new Date(), {
      ownerPreview: false,
    })
    expect(view?.kind === "letter" && view.content.gifts).toEqual([
      { title: "A" },
      { title: "B", url: "https://example.com/b", imageUrl: "https://example.com/b.png" },
    ])
  })
})

describe("calendarDate", () => {
  it("formats today's date in a timezone as YYYY-MM-DD", () => {
    const instant = new Date("2026-11-30T23:30:00Z")
    expect(calendarDate(instant, "Europe/Berlin")).toBe("2026-12-01")
    expect(calendarDate(instant, "America/New_York")).toBe("2026-11-30")
    expect(calendarDate(instant, "UTC")).toBe("2026-11-30")
  })
})
