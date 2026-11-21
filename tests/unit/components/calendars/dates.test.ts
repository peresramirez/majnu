import { describe, expect, it } from "vitest"
import { addDays, dayParts, daysBetween, formatDay, opensOnFor, previewCalendar, todayIn } from "@/components/calendars/dates"
import { calendarFixtures } from "@/lib/letters/fixtures"

describe("dates", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01")
    expect(opensOnFor("2026-12-01", 24)).toBe("2026-12-24")
  })
  it("reads today's date in the calendar's timezone, not UTC", () => {
    const lateNightUtc = new Date("2026-11-30T23:30:00Z")
    expect(todayIn("UTC", lateNightUtc)).toBe("2026-11-30")
    expect(todayIn("Europe/Berlin", lateNightUtc)).toBe("2026-12-01")
    expect(todayIn("America/New_York", lateNightUtc)).toBe("2026-11-30")
  })
  it("falls back to UTC for an unknown timezone", () => {
    expect(todayIn("Mars/Olympus", new Date("2026-12-01T12:00:00Z"))).toBe("2026-12-01")
  })
  it("formats opening dates", () => {
    expect(formatDay("2026-12-03")).toBe("3 December")
    expect(formatDay("2026-12-03", "short")).toBe("3 Dec")
    expect(formatDay("2026-12-03T00:00:00+01:00")).toBe("3 December")
    expect(dayParts("2027-03-01")).toEqual({ day: "1", month: "Mar", weekday: "Mon" })
    expect(daysBetween("2026-12-01", "2026-12-24")).toBe(23)
  })
})

describe("previewCalendar", () => {
  const advent = calendarFixtures["advent-classic"]

  it("locks doors that have not opened yet, with nothing but day and date", () => {
    // 3 December, 09:00 in Berlin
    const view = previewCalendar(advent, { now: new Date("2026-12-03T08:00:00Z"), allOpen: false })
    expect(view.doors.filter((d) => !d.locked).map((d) => d.day)).toEqual([1, 2, 3])
    const locked = view.doors.find((d) => d.day === 4)!
    expect(locked).toEqual({ day: 4, locked: true, opensOn: "2026-12-04" })
    const json = JSON.stringify(view)
    for (const door of advent.doors.filter((d) => d.day > 3)) {
      expect(json).not.toContain(door.message)
      if (door.gift?.code) expect(json).not.toContain(door.gift.code)
    }
  })

  it("opens a door at midnight in the calendar's timezone", () => {
    const beforeMidnight = previewCalendar(advent, { now: new Date("2026-11-30T22:59:00Z"), allOpen: false })
    const afterMidnight = previewCalendar(advent, { now: new Date("2026-11-30T23:01:00Z"), allOpen: false })
    expect(beforeMidnight.doors[0].locked).toBe(true)
    expect(afterMidnight.doors[0].locked).toBe(false)
  })

  it("opens every door in the owner's preview", () => {
    const view = previewCalendar(advent, { now: new Date("2026-11-01T00:00:00Z"), allOpen: true })
    expect(view.doors).toHaveLength(24)
    expect(view.doors.every((d) => !d.locked)).toBe(true)
    const six = view.doors[5]
    expect(six.locked === false && six.gift?.code).toBe("RSCH-NIKO-06")
  })
})
