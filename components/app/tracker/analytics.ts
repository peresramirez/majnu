// The Tracker dashboard's numbers (issue #75): the headline totals, opens per
// day and per hour, and where, on what and in which language gifts were
// opened. Pure, like timeline.ts, so it runs the same on the server and in the
// browser and is unit-tested. Anything that depends on a calendar day or an
// hour takes the viewer's timezone explicitly, never the machine's.
import type { TrackedEvent } from "@/lib/open/timeline"
import {
  countryName,
  dayKey,
  deviceName,
  formatterFor,
  languageName,
  previousDay,
  type TrackerLetter,
} from "./timeline"

// An open is the recipient opening the page or a calendar door. Tapping the
// gift is recorded too, but it is not an open.
export function isOpen(event: Pick<TrackedEvent, "type">): boolean {
  return event.type === "open" || event.type === "door_open"
}

// ---------- Headline numbers ----------

export type TotalsLetter = TrackerLetter & { id: string }

export type TrackerTotals = {
  // Gifts with a finished page, so they can be opened. Drafts are left out.
  giftsSent: number
  giftsOpened: number
  // giftsOpened / giftsSent, or null before the first gift is sent.
  openRate: number | null
  // Page opens plus calendar doors opened, as each gift's status line counts them.
  opens: number
  // The sum of each gift's distinct visitors. The visitor hash includes the
  // letter, so one person who opens two gifts counts once for each.
  visitors: number
  giftTaps: number
}

export function trackerTotals(letters: TotalsLetter[], events: TrackedEvent[]): TrackerTotals {
  const counts = countByLetter(events)
  let giftsSent = 0
  let giftsOpened = 0
  let opens = 0
  let visitors = 0
  let giftTaps = 0
  for (const letter of letters) {
    const own = counts.get(letter.id)
    opens += letter.stats.totalOpens + (own?.doors ?? 0)
    visitors += letter.stats.uniqueVisitors
    giftTaps += own?.taps ?? 0
    if (!letter.hasContent) continue
    giftsSent++
    if (letter.stats.totalOpens > 0 || (own?.events ?? 0) > 0) giftsOpened++
  }
  return { giftsSent, giftsOpened, openRate: giftsSent ? giftsOpened / giftsSent : null, opens, visitors, giftTaps }
}

function countByLetter(events: TrackedEvent[]) {
  const counts = new Map<string, { events: number; doors: number; taps: number }>()
  for (const event of events) {
    const count = counts.get(event.letterId) ?? { events: 0, doors: 0, taps: 0 }
    count.events++
    if (event.type === "door_open") count.doors++
    if (event.type === "gift_click") count.taps++
    counts.set(event.letterId, count)
  }
  return counts
}

// One gift's own numbers for its row in the list: opens counted the same way
// as the headline, and the people who opened it (at least one once it is opened).
export function giftNumbers(letter: TrackerLetter, events: TrackedEvent[]) {
  const doors = events.filter((e) => e.type === "door_open").length
  const taps = events.filter((e) => e.type === "gift_click").length
  const opened = letter.stats.totalOpens > 0 || events.length > 0
  return {
    opened,
    opens: letter.stats.totalOpens + doors,
    visitors: opened ? Math.max(letter.stats.uniqueVisitors, 1) : 0,
    taps,
    firstOpenedAt: letter.stats.firstOpenedAt,
    lastOpenedAt: letter.stats.lastOpenedAt,
  }
}

// ---------- Opens over time ----------

export const CHART_DAYS = 30

export type DayCount = { key: string; opens: number }

// The last `days` calendar days in the viewer's timezone, oldest first and
// ending today, with the opens on each. Days without opens are there with 0,
// so the chart's axis is always the same 30 days.
export function opensPerDay(times: string[], timeZone: string, now: Date, days = CHART_DAYS): DayCount[] {
  const keys: string[] = []
  let key = dayKey(now, timeZone)
  for (let i = 0; i < days; i++) {
    keys.push(key)
    key = previousDay(key)
  }
  keys.reverse()
  const index = new Map(keys.map((k, i) => [k, i]))
  const result = keys.map((k) => ({ key: k, opens: 0 }))
  for (const at of times) {
    const i = index.get(dayKey(at, timeZone))
    if (i !== undefined) result[i].opens++
  }
  return result
}

// 0 to 23 in the viewer's timezone.
export function hourOf(iso: string, timeZone: string): number {
  const hour = Number(formatterFor(timeZone, "hour", { hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)))
  return Number.isInteger(hour) ? hour % 24 : 0
}

export type HourCount = { hour: number; opens: number }

// Opens by hour of the day, 00:00 to 23:00, in the viewer's timezone.
export function opensByHour(times: string[], timeZone: string): HourCount[] {
  const result = Array.from({ length: 24 }, (_, hour) => ({ hour, opens: 0 }))
  for (const at of times) result[hourOf(at, timeZone)].opens++
  return result
}

// The busiest entry, the earliest one on a tie, or null when every count is 0.
export function busiest<T extends { opens: number }>(counts: T[]): T | null {
  let best: T | null = null
  for (const count of counts) if (count.opens > (best?.opens ?? 0)) best = count
  return best
}

// Whole-number ticks for a chart's count axis, evenly spaced in steps of 1,
// 2 or 5 times a power of ten, from 0 to at least the largest count (and at
// least 4, so an empty or tiny chart still has a scale): 6 -> 0, 2, 4, 6.
export function countTicks(max: number): number[] {
  const top = Math.max(max, 4)
  const rough = top / 4
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? 10 * power
  const ticks = [0]
  while (ticks[ticks.length - 1] < top) ticks.push(ticks[ticks.length - 1] + step)
  return ticks
}

function opensWord(n: number) {
  return n === 1 ? "1 open" : `${n} opens`
}

// The one line under the daily chart. A single busiest day is named; when
// several days tie, naming one would be arbitrary, so it says how many days
// had opens instead.
export function dailySummary(days: DayCount[]): string {
  const peak = busiest(days)
  if (!peak) return `No opens in the last ${days.length} days yet.`
  const withOpens = days.filter((d) => d.opens > 0).length
  const tied = days.filter((d) => d.opens === peak.opens).length
  if (tied === 1) return `Busiest day: ${dayLabel(peak.key, "long")}, with ${opensWord(peak.opens)}.`
  const most = peak.opens === 1 ? "once on each" : `at most ${opensWord(peak.opens)} a day`
  return `Opened on ${withOpens} of the last ${days.length} days, ${most}.`
}

// The one line under the hourly chart, in the same way.
export function hourlySummary(hours: HourCount[]): string {
  const peak = busiest(hours)
  if (!peak) return "No opens yet."
  const tied = hours.filter((h) => h.opens === peak.opens).length
  if (tied === 1) return `Busiest hour: ${hourRange(peak.hour)}, with ${opensWord(peak.opens)}.`
  const withOpens = hours.filter((h) => h.opens > 0).length
  const most = peak.opens === 1 ? "once in each" : `at most ${opensWord(peak.opens)} in one hour`
  return `Opened in ${withOpens} different hours of the day, ${most}.`
}

// "Sat 14 Nov" for "2026-11-14". The key is already a day in the viewer's
// timezone, so it is formatted as a plain calendar date.
export function dayLabel(key: string, style: "short" | "long" = "short"): string {
  const [y, m, d] = key.split("-").map(Number)
  return formatterFor("UTC", `day-label-${style}`, {
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

// "14 Nov": the chart's axis.
export function dayTick(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return formatterFor("UTC", "day-tick", { day: "numeric", month: "short" }).format(new Date(Date.UTC(y, m - 1, d, 12)))
}

// "08:00".
export function hourTick(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`
}

// "20:00 to 21:00", and "23:00 to 00:00" for the last hour.
export function hourRange(hour: number): string {
  return `${hourTick(hour)} to ${hourTick((hour + 1) % 24)}`
}

// ---------- Where, on what, in which language ----------

export type Slice = {
  key: string
  label: string
  count: number
  // count / every open, 0 to 1.
  share: number
  kind: "value" | "other" | "unknown"
}

// Opens counted by one detail, largest first (ties by name), at most `top`
// named rows. The rest fold into one "Other" row, unless only one is left,
// which is then shown by name. Opens without the detail come last as
// "Not recorded", so the rows always add up to every open.
export function breakdown(
  values: (string | null)[],
  label: (key: string) => string,
  { top = 5, other = "Other" }: { top?: number; other?: string } = {},
): Slice[] {
  const total = values.length
  if (total === 0) return []
  const counts = new Map<string, number>()
  let unknown = 0
  for (const value of values) {
    if (value === null) unknown++
    else counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const named = [...counts]
    .map(([key, count]) => ({ key, label: label(key), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  const shown = named.length > top + 1 ? named.slice(0, top) : named
  const rest = named.slice(shown.length).reduce((sum, row) => sum + row.count, 0)
  const slices: Slice[] = shown.map((row) => ({ ...row, share: row.count / total, kind: "value" }))
  if (rest > 0) slices.push({ key: "other", label: other, count: rest, share: rest / total, kind: "other" })
  if (unknown > 0) slices.push({ key: "unknown", label: "Not recorded", count: unknown, share: unknown / total, kind: "unknown" })
  return slices
}

export function countryBreakdown(events: TrackedEvent[], top = 5): Slice[] {
  return breakdown(events.filter(isOpen).map((e) => e.country), countryName, { top, other: "Other countries" })
}

export function deviceBreakdown(events: TrackedEvent[]): Slice[] {
  return breakdown(
    events.filter(isOpen).map((e) => e.device),
    (key) => deviceName(key as TrackedEvent["device"]) ?? key,
  )
}

export function languageBreakdown(events: TrackedEvent[], top = 5): Slice[] {
  return breakdown(events.filter(isOpen).map((e) => e.language), (key) => languageName(key) ?? key, {
    top,
    other: "Other languages",
  })
}

// "42%". Shares under 1% that are not 0 read "<1%", so a row never claims none.
export function percent(share: number): string {
  if (share > 0 && share < 0.005) return "<1%"
  return `${Math.round(share * 100)}%`
}
