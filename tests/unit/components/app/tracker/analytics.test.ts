// The Tracker dashboard's numbers (components/app/tracker/analytics.ts).
import { describe, expect, it } from "vitest"
import {
  breakdown,
  busiest,
  countTicks,
  countryBreakdown,
  dailySummary,
  dayLabel,
  dayTick,
  deviceBreakdown,
  giftNumbers,
  hourlySummary,
  hourOf,
  hourRange,
  isOpen,
  languageBreakdown,
  opensByHour,
  opensPerDay,
  percent,
  trackerTotals,
  type TotalsLetter,
} from "@/components/app/tracker/analytics"
import { shortDateTime, type TrackedEvent } from "@/components/app/tracker/timeline"

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const C = "33333333-3333-4333-8333-333333333333"

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

function letter(id: string, more: Partial<TotalsLetter["stats"]> = {}, hasContent = true): TotalsLetter {
  return {
    id,
    hasContent,
    stats: { firstOpenedAt: null, lastOpenedAt: null, totalOpens: 0, uniqueVisitors: 0, ...more },
  }
}

const NOW = new Date("2026-11-22T10:00:00Z")

describe("trackerTotals", () => {
  it("is all zeros, with no open rate, before the first gift", () => {
    expect(trackerTotals([], [])).toEqual({
      giftsSent: 0,
      giftsOpened: 0,
      openRate: null,
      opens: 0,
      visitors: 0,
      giftTaps: 0,
    })
  })

  it("counts finished gifts as sent, leaves drafts out, and counts a calendar's doors as opens", () => {
    const opened = letter(A, { totalOpens: 2, uniqueVisitors: 2, lastOpenedAt: "2026-11-21T09:00:00Z" })
    const calendar = letter(B, { totalOpens: 1, uniqueVisitors: 1, lastOpenedAt: "2026-11-21T09:00:00Z" })
    const waiting = letter(C)
    const draft = letter("draft", {}, false)
    const events = [
      event("2026-11-21T09:00:00Z"),
      event("2026-11-21T09:05:00Z"),
      event("2026-11-20T09:00:00Z", { letterId: B }),
      event("2026-11-20T09:01:00Z", { letterId: B, type: "door_open", day: 1 }),
      event("2026-11-20T09:02:00Z", { letterId: B, type: "door_open", day: 2 }),
      event("2026-11-20T09:03:00Z", { letterId: B, type: "gift_click", day: 2 }),
    ]
    expect(trackerTotals([opened, calendar, waiting, draft], events)).toEqual({
      giftsSent: 3,
      giftsOpened: 2,
      openRate: 2 / 3,
      opens: 5,
      visitors: 3,
      giftTaps: 1,
    })
  })

  it("counts a gift as opened from its summary even when its events are past the page limit", () => {
    const totals = trackerTotals([letter(A, { totalOpens: 1, uniqueVisitors: 1 })], [])
    expect(totals.giftsOpened).toBe(1)
    expect(totals.openRate).toBe(1)
  })
})

describe("giftNumbers", () => {
  it("counts page opens plus doors, and at least one person once opened", () => {
    const calendar = letter(B, { totalOpens: 1, uniqueVisitors: 0, firstOpenedAt: "2026-11-20T09:00:00Z" })
    const events = [
      event("2026-11-20T09:00:00Z", { letterId: B }),
      event("2026-11-20T09:01:00Z", { letterId: B, type: "door_open", day: 1 }),
      event("2026-11-20T09:03:00Z", { letterId: B, type: "gift_click", day: 1 }),
    ]
    expect(giftNumbers(calendar, events)).toMatchObject({ opened: true, opens: 2, visitors: 1, taps: 1 })
    expect(giftNumbers(letter(C), [])).toMatchObject({ opened: false, opens: 0, visitors: 0, taps: 0 })
  })
})

describe("opensPerDay", () => {
  it("lists the last 30 days, oldest first and ending today, with empty days at 0", () => {
    const days = opensPerDay([], "Europe/Berlin", NOW)
    expect(days).toHaveLength(30)
    expect(days[0]).toEqual({ key: "2026-10-24", opens: 0 })
    expect(days[29]).toEqual({ key: "2026-11-22", opens: 0 })
  })

  it("puts each open on its day in the viewer's timezone and drops older ones", () => {
    const times = [
      "2026-11-21T23:30:00Z", // 22 Nov in Berlin, 21 Nov in New York
      "2026-11-22T08:00:00Z",
      "2026-10-24T12:00:00Z", // the first day shown
      "2026-10-23T12:00:00Z", // too old
    ]
    const berlin = opensPerDay(times, "Europe/Berlin", NOW)
    expect(berlin.at(-1)).toEqual({ key: "2026-11-22", opens: 2 })
    expect(berlin[0]).toEqual({ key: "2026-10-24", opens: 1 })
    expect(berlin.reduce((sum, d) => sum + d.opens, 0)).toBe(3)

    const newYork = opensPerDay(times, "America/New_York", NOW)
    expect(newYork.at(-1)).toEqual({ key: "2026-11-22", opens: 1 })
    expect(newYork.at(-2)).toEqual({ key: "2026-11-21", opens: 1 })
  })

  it("keeps every calendar day across a clock change", () => {
    // Berlin went back an hour on 25 October 2026; 26 October 23:00 Berlin
    // time (22:00 UTC) still belongs to the 26th.
    const days = opensPerDay(["2026-10-26T22:00:00Z"], "Europe/Berlin", new Date("2026-10-27T10:00:00Z"), 5)
    expect(days.map((d) => d.key)).toEqual(["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"])
    expect(days[3].opens).toBe(1)
  })
})

describe("opensByHour", () => {
  it("has the 24 hours of the day in the viewer's timezone", () => {
    const times = ["2026-11-21T19:30:00Z", "2026-11-21T19:59:00Z", "2026-11-21T23:30:00Z"]
    const berlin = opensByHour(times, "Europe/Berlin")
    expect(berlin).toHaveLength(24)
    expect(berlin[20].opens).toBe(2)
    expect(berlin[0].opens).toBe(1)
    expect(opensByHour(times, "UTC")[19].opens).toBe(2)
    expect(hourOf("2026-11-22T00:15:00Z", "UTC")).toBe(0)
    expect(hourOf("2026-11-22T23:59:00Z", "Asia/Kolkata")).toBe(5)
  })

  it("names the busiest hour, the earliest on a tie, and none when nothing was opened", () => {
    const hours = opensByHour(["2026-11-21T09:00:00Z", "2026-11-21T20:00:00Z"], "UTC")
    expect(busiest(hours)?.hour).toBe(9)
    expect(busiest(opensByHour([], "UTC"))).toBeNull()
    expect(hourRange(20)).toBe("20:00 to 21:00")
    expect(hourRange(23)).toBe("23:00 to 00:00")
  })
})

describe("the charts' summaries", () => {
  it("names a single busiest day or hour", () => {
    const days = opensPerDay(["2026-11-14T12:00:00Z", "2026-11-14T13:00:00Z", "2026-11-20T12:00:00Z"], "UTC", NOW)
    expect(dailySummary(days)).toBe("Busiest day: Saturday 14 November, with 2 opens.")
    const hours = opensByHour(["2026-11-14T20:10:00Z", "2026-11-14T20:50:00Z", "2026-11-20T08:00:00Z"], "UTC")
    expect(hourlySummary(hours)).toBe("Busiest hour: 20:00 to 21:00, with 2 opens.")
  })

  it("does not pick one of several tied days or hours", () => {
    const times = ["2026-11-21T05:30:00Z", "2026-11-22T06:30:00Z"]
    expect(dailySummary(opensPerDay(times, "UTC", NOW))).toBe("Opened on 2 of the last 30 days, once on each.")
    expect(hourlySummary(opensByHour(times, "UTC"))).toBe("Opened in 2 different hours of the day, once in each.")
    const twice = [...times, "2026-11-21T05:40:00Z", "2026-11-22T06:40:00Z"]
    expect(dailySummary(opensPerDay(twice, "UTC", NOW))).toBe("Opened on 2 of the last 30 days, at most 2 opens a day.")
    expect(hourlySummary(opensByHour(twice, "UTC"))).toBe("Opened in 2 different hours of the day, at most 2 opens in one hour.")
  })

  it("says so before the first open", () => {
    expect(dailySummary(opensPerDay([], "UTC", NOW))).toBe("No opens in the last 30 days yet.")
    expect(hourlySummary(opensByHour([], "UTC"))).toBe("No opens yet.")
  })
})

describe("countTicks", () => {
  it("spaces whole numbers evenly from 0 past the largest count", () => {
    expect(countTicks(0)).toEqual([0, 1, 2, 3, 4])
    expect(countTicks(4)).toEqual([0, 1, 2, 3, 4])
    expect(countTicks(5)).toEqual([0, 2, 4, 6])
    expect(countTicks(9)).toEqual([0, 5, 10])
    expect(countTicks(28)).toEqual([0, 10, 20, 30])
    expect(countTicks(130)).toEqual([0, 50, 100, 150])
  })
})

describe("labels", () => {
  it("names a day key as the calendar date it is", () => {
    expect(dayLabel("2026-11-14")).toBe("Sat 14 Nov")
    expect(dayLabel("2026-11-14", "long")).toBe("Saturday 14 November")
    expect(dayTick("2026-11-02")).toBe("2 Nov")
  })

  it("writes a gift's first and last open in the viewer's timezone", () => {
    expect(shortDateTime("2026-11-22T08:00:00Z", "Europe/Berlin", NOW)).toBe("Today, 09:00")
    // 23:30 UTC on the 21st is already the 22nd in Berlin.
    expect(shortDateTime("2026-11-21T23:30:00Z", "Europe/Berlin", NOW)).toBe("Today, 00:30")
    expect(shortDateTime("2026-11-21T23:30:00Z", "UTC", NOW)).toBe("Yesterday, 23:30")
    expect(shortDateTime("2026-11-02T12:00:00Z", "UTC", NOW)).toBe("2 Nov, 12:00")
    expect(shortDateTime("2025-12-03T12:00:00Z", "UTC", NOW)).toBe("3 Dec 2025, 12:00")
  })

  it("rounds shares and never shows a small one as none", () => {
    expect(percent(0)).toBe("0%")
    expect(percent(2 / 3)).toBe("67%")
    expect(percent(0.001)).toBe("<1%")
    expect(percent(1)).toBe("100%")
  })
})

describe("breakdown", () => {
  const name = (key: string) => key.toUpperCase()

  it("ranks by count, then by name, and adds up to every value", () => {
    const slices = breakdown(["b", "a", "b", null, "c", "a", "b"], name)
    expect(slices.map((s) => [s.label, s.count, s.kind])).toEqual([
      ["B", 3, "value"],
      ["A", 2, "value"],
      ["C", 1, "value"],
      ["Not recorded", 1, "unknown"],
    ])
    expect(slices.reduce((sum, s) => sum + s.share, 0)).toBeCloseTo(1)
  })

  it("folds the tail into Other, but names a single leftover instead", () => {
    const many = ["a", "a", "b", "b", "c", "d", "e"]
    expect(breakdown(many, name, { top: 2 }).map((s) => [s.label, s.count])).toEqual([
      ["A", 2],
      ["B", 2],
      ["Other", 3],
    ])
    expect(breakdown(["a", "a", "b", "c"], name, { top: 2 }).map((s) => s.label)).toEqual(["A", "B", "C"])
    expect(breakdown([], name)).toEqual([])
  })

  it("counts opens and doors by country, device and language, not gift taps", () => {
    const events = [
      event("2026-11-21T09:00:00Z", { country: "DE", device: "phone", language: "de" }),
      event("2026-11-21T09:01:00Z", { type: "door_open", day: 1, country: "DE", device: "phone", language: "de" }),
      event("2026-11-21T09:02:00Z", { type: "gift_click", day: 1, country: "DE", device: "phone", language: "de" }),
      event("2026-11-21T10:00:00Z", { country: "FR", device: "desktop", language: "fr" }),
      event("2026-11-21T11:00:00Z"),
    ]
    expect(events.filter(isOpen)).toHaveLength(4)
    expect(countryBreakdown(events).map((s) => [s.key, s.label, s.count])).toEqual([
      ["DE", "Germany", 2],
      ["FR", "France", 1],
      ["unknown", "Not recorded", 1],
    ])
    expect(deviceBreakdown(events).map((s) => [s.label, s.count])).toEqual([
      ["Phone", 2],
      ["Computer", 1],
      ["Not recorded", 1],
    ])
    expect(languageBreakdown(events).map((s) => [s.label, s.count])).toEqual([
      ["German", 2],
      ["French", 1],
      ["Not recorded", 1],
    ])
  })
})
