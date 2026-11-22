import { describe, expect, it } from "vitest"
import {
  buildIcs,
  countdownTo,
  eventDateParts,
  formatEventDate,
  formatEventTime,
  icsFileName,
  mapsUrl,
  parseEventStart,
} from "@/components/letters/event-time"

describe("parseEventStart", () => {
  it("keeps the local wall-clock time and finds the real instant", () => {
    const s = parseEventStart("2027-06-12T15:00:00+02:00")!
    expect([s.year, s.month, s.day, s.hour, s.minute]).toEqual([2027, 6, 12, 15, 0])
    expect(s.instant.toISOString()).toBe("2027-06-12T13:00:00.000Z")
  })
  it("handles Z, negative offsets and no seconds", () => {
    expect(parseEventStart("2026-12-05T20:00Z")!.instant.toISOString()).toBe("2026-12-05T20:00:00.000Z")
    expect(parseEventStart("2026-12-05T20:30-05:00")!.instant.toISOString()).toBe("2026-12-06T01:30:00.000Z")
  })
  it("rejects anything that is not a date and time", () => {
    expect(parseEventStart("next Saturday")).toBeNull()
    expect(parseEventStart("2026-13-01T10:00:00Z")).toBeNull()
    expect(parseEventStart(undefined)).toBeNull()
  })
})

describe("formatting", () => {
  const s = parseEventStart("2027-06-12T15:00:00+02:00")!
  it("formats the date in the event's own time", () => {
    expect(formatEventDate(s)).toBe("Saturday 12 June 2027")
    expect(eventDateParts(s)).toMatchObject({ weekdayShort: "Sat", day: "12", monthShort: "Jun", year: "2027" })
  })
  it("formats the time without the viewer's timezone", () => {
    expect(formatEventTime(s)).toBe("3 pm")
    expect(formatEventTime(parseEventStart("2026-12-05T20:30:00+01:00")!)).toBe("8:30 pm")
    expect(formatEventTime(parseEventStart("2026-12-05T00:05:00+01:00")!)).toBe("12:05 am")
    expect(formatEventTime(parseEventStart("2026-12-05T12:00:00+01:00")!)).toBe("12 pm")
  })
})

describe("countdownTo", () => {
  it("splits the time left into days, hours, minutes and seconds", () => {
    const target = new Date("2026-12-05T19:00:00Z")
    expect(countdownTo(target, new Date("2026-12-03T17:58:30Z"))).toEqual({ days: 2, hours: 1, minutes: 1, seconds: 30, past: false })
  })
  it("says when the moment has passed", () => {
    expect(countdownTo(new Date(0), new Date()).past).toBe(true)
  })
})

describe("mapsUrl", () => {
  it("builds a Google Maps search link for the place", () => {
    expect(mapsUrl("Gut Sarnow", "Dorfstraße 1, 17398 Sarnow")).toBe(
      "https://www.google.com/maps/search/?api=1&query=Gut%20Sarnow%2C%20Dorfstra%C3%9Fe%201%2C%2017398%20Sarnow",
    )
  })
})

describe("buildIcs", () => {
  const start = parseEventStart("2027-06-12T15:00:00+02:00")!.instant
  const ics = buildIcs({
    uid: "abc@majnu.app",
    title: "Clara and Ben's wedding; dinner, dancing",
    start,
    location: "Gut Sarnow, Dorfstraße 1, 17398 Sarnow, Germany",
    description: "Invitation from Clara and Ben",
    now: new Date("2026-11-21T10:00:00Z"),
  })

  it("is a valid calendar with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true)
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(ics.split("\r\n").every((line) => !line.includes("\n"))).toBe(true)
  })
  it("stores times in UTC with a three hour default length", () => {
    expect(ics).toContain("DTSTART:20270612T130000Z")
    expect(ics).toContain("DTEND:20270612T160000Z")
    expect(ics).toContain("DTSTAMP:20261121T100000Z")
  })
  it("escapes commas and semicolons", () => {
    expect(ics).toContain("SUMMARY:Clara and Ben's wedding\\; dinner\\, dancing")
  })
  it("folds lines longer than 75 octets", () => {
    const long = buildIcs({ uid: "x", title: "ü".repeat(80), start, now: start })
    for (const line of long.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75)
    const unfolded = long.replace(/\r\n /g, "")
    expect(unfolded).toContain(`SUMMARY:${"ü".repeat(80)}`)
  })
})

describe("icsFileName", () => {
  it("makes a safe file name from the event title", () => {
    expect(icsFileName("Clara and Ben's wedding")).toBe("clara-and-bens-wedding.ics")
    expect(icsFileName("Mia's 25th 🎉")).toBe("mias-25th.ics")
    expect(icsFileName("")).toBe("invitation.ics")
  })
})
