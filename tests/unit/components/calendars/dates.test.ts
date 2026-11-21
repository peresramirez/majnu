import { describe, expect, it } from "vitest"
import { dayParts, formatDay, todayIn } from "@/components/calendars/dates"

describe("todayIn", () => {
  it("reads today's date in the calendar's timezone, not UTC", () => {
    const lateNightUtc = new Date("2026-11-30T23:30:00Z")
    expect(todayIn("UTC", lateNightUtc)).toBe("2026-11-30")
    expect(todayIn("Europe/Berlin", lateNightUtc)).toBe("2026-12-01")
    expect(todayIn("America/New_York", lateNightUtc)).toBe("2026-11-30")
  })
  it("falls back to UTC for an unknown timezone", () => {
    expect(todayIn("Mars/Olympus", new Date("2026-12-01T12:00:00Z"))).toBe("2026-12-01")
  })
})

describe("door labels", () => {
  it("formats opening dates", () => {
    expect(formatDay("2026-12-03")).toBe("3 December")
    expect(formatDay("2026-12-03", "short")).toBe("3 Dec")
    expect(formatDay("2026-12-03T00:00:00+01:00")).toBe("3 December")
    expect(formatDay("soon")).toBe("soon")
  })
  it("splits a date for tear-off pages", () => {
    expect(dayParts("2027-03-01")).toEqual({ day: "1", month: "Mar", weekday: "Mon" })
  })
})
