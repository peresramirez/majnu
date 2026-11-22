// The Tracker tab's grouping and wording (components/app/tracker/timeline.ts).
import { describe, expect, it } from "vitest"
import {
  countryFlag,
  dayKey,
  deviceName,
  eventsByLetter,
  eventTitle,
  groupByDay,
  languageName,
  placeName,
  timeOfDay,
  trackerSignUpPath,
  trackerStatus,
  type TrackedEvent,
} from "@/components/app/tracker/timeline"
import { safeNextPath } from "@/lib/billing/next-path"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"

let nextId = 1
function event(at: string, more: Partial<TrackedEvent> = {}): TrackedEvent {
  return {
    id: nextId++,
    letterId: A,
    type: "open",
    day: 0,
    country: null,
    city: null,
    language: null,
    device: null,
    at,
    ...more,
  }
}

const NOW = new Date("2026-11-22T10:00:00Z")

describe("eventsByLetter", () => {
  it("splits events by gift, newest first, whatever order they arrive in", () => {
    const e1 = event("2026-11-20T09:00:00Z")
    const e2 = event("2026-11-21T09:00:00Z", { letterId: B })
    const e3 = event("2026-11-22T09:00:00Z")
    const byLetter = eventsByLetter([e1, e2, e3])
    expect(byLetter.get(A)?.map((e) => e.id)).toEqual([e3.id, e1.id])
    expect(byLetter.get(B)?.map((e) => e.id)).toEqual([e2.id])
    expect(byLetter.has("someone-else")).toBe(false)
  })
})

describe("groupByDay", () => {
  it("groups by calendar day in the viewer's timezone, not in UTC", () => {
    // 23:30 UTC on 21 November is already 22 November in Berlin, and still
    // 21 November in New York.
    const late = event("2026-11-21T23:30:00Z")
    const morning = event("2026-11-22T08:00:00Z")
    const berlin = groupByDay([late, morning], "Europe/Berlin", NOW)
    expect(berlin.map((g) => [g.label, g.events.length])).toEqual([["Today", 2]])

    const newYork = groupByDay([late, morning], "America/New_York", NOW)
    expect(newYork.map((g) => [g.label, g.events.map((e) => e.id)])).toEqual([
      ["Today", [morning.id]],
      ["Yesterday", [late.id]],
    ])
  })

  it("names older days by date, with the year only outside this one", () => {
    const groups = groupByDay(
      [event("2026-11-19T12:00:00Z"), event("2025-12-03T12:00:00Z")],
      "Europe/Berlin",
      NOW,
    )
    expect(groups.map((g) => g.label)).toEqual(["Thursday 19 November", "3 December 2025"])
  })

  it("counts yesterday by the calendar across a clock change", () => {
    // Berlin leaves summer time on 25 October 2026, so that day has 25 hours.
    const now = new Date("2026-10-26T00:30:00+01:00")
    const groups = groupByDay([event("2026-10-25T00:30:00+02:00"), event("2026-10-24T23:30:00+02:00")], "Europe/Berlin", now)
    expect(groups.map((g) => g.label)).toEqual(["Yesterday", "Saturday 24 October"])
    expect(dayKey("2026-10-25T23:30:00Z", "Europe/Berlin")).toBe("2026-10-26")
  })

  it("formats the time of day in the timezone", () => {
    expect(timeOfDay("2026-11-22T13:05:00Z", "Europe/Berlin")).toBe("14:05")
    expect(timeOfDay("2026-11-22T13:05:00Z", "UTC")).toBe("13:05")
  })
})

describe("one line of the timeline", () => {
  it("says what happened, with doors and gifts as their own lines", () => {
    expect(eventTitle({ type: "open", day: 0 }, "letter")).toBe("Opened")
    expect(eventTitle({ type: "door_open", day: 3 }, "calendar")).toBe("Opened door 3")
    expect(eventTitle({ type: "gift_click", day: 0 }, "letter")).toBe("Tapped the gift")
    expect(eventTitle({ type: "gift_click", day: 5 }, "calendar")).toBe("Tapped the gift behind door 5")
  })

  it("names the place, the language and the device", () => {
    expect(placeName("DE", "Berlin")).toBe("Berlin, Germany")
    expect(placeName("AT", null)).toBe("Austria")
    expect(placeName(null, null)).toBeNull()
    expect(countryFlag("DE")).toBe("🇩🇪")
    expect(countryFlag("de")).toBe("")
    expect(countryFlag(null)).toBe("")
    expect(languageName("de")).toBe("German")
    expect(languageName("pt")).toBe("Portuguese")
    expect(languageName(null)).toBeNull()
    expect(deviceName("phone")).toBe("Phone")
    expect(deviceName("tablet")).toBe("Tablet")
    expect(deviceName("desktop")).toBe("Computer")
    expect(deviceName(null)).toBeNull()
  })
})

describe("trackerStatus", () => {
  const stats = { firstOpenedAt: null, lastOpenedAt: null, totalOpens: 0, uniqueVisitors: 0 }

  it("says a draft cannot be opened and a sent gift is waiting", () => {
    expect(trackerStatus({ hasContent: false, stats }, [], NOW)).toMatchObject({ state: "draft", headline: "Not finished yet" })
    expect(trackerStatus({ hasContent: true, stats }, [], NOW)).toMatchObject({ state: "waiting", headline: "Not opened yet" })
  })

  it("counts people, and times only when a calendar's doors add to them", () => {
    const opened = { firstOpenedAt: "2026-11-22T07:00:00Z", lastOpenedAt: "2026-11-22T08:00:00Z", totalOpens: 2, uniqueVisitors: 2 }
    const letterEvents = [event("2026-11-22T08:00:00Z"), event("2026-11-22T07:00:00Z")]
    expect(trackerStatus({ hasContent: true, stats: opened }, letterEvents, NOW)).toEqual({
      state: "opened",
      headline: "Opened by 2 people",
      detail: "Last opened 2 hours ago",
    })

    const calendar = { ...opened, totalOpens: 1, uniqueVisitors: 1 }
    const calendarEvents = [
      event("2026-11-22T08:00:00Z", { type: "gift_click", day: 2 }),
      event("2026-11-22T07:50:00Z", { type: "door_open", day: 2 }),
      event("2026-11-22T07:40:00Z", { type: "door_open", day: 1 }),
      event("2026-11-22T07:30:00Z"),
    ]
    expect(trackerStatus({ hasContent: true, stats: calendar }, calendarEvents, NOW)).toEqual({
      state: "opened",
      headline: "Opened 3 times by one person",
      detail: "Last opened 2 hours ago · gift tapped once",
    })
  })
})

describe("the guest invitation", () => {
  it("links to sign-up with a same-site way back to the Tracker", () => {
    expect(trackerSignUpPath).toBe("/signup?next=%2Fdashboard%2Ftracker")
    const next = new URL(trackerSignUpPath, "https://majnu.app").searchParams.get("next")
    expect(safeNextPath(next)).toBe("/dashboard/tracker")
  })
})
