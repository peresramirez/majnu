// The Tracker tab's wording and grouping (issue #49). Pure, so it runs the
// same on the server and in the browser and is unit-tested; times are always
// formatted for an explicit timezone, never the machine's.
import { withNext } from "@/lib/billing/next-path"
import type { TrackedEvent } from "@/lib/open/timeline"
import type { LetterKind } from "@/lib/letters/schema"
import { timeAgo } from "../format"

export type { TrackedEvent }

export const TRACKER_PATH = "/dashboard/tracker"

// Where a guest creates their account: sign-up keeps the guest's gifts (it
// upgrades the same account) and the same-site `next` brings them back here.
export const trackerSignUpPath = withNext("/signup", TRACKER_PATH)

// ---------- Grouping ----------

// Every letter's events, newest first.
export function eventsByLetter(events: TrackedEvent[]): Map<string, TrackedEvent[]> {
  const byLetter = new Map<string, TrackedEvent[]>()
  for (const event of [...events].sort(newestFirst)) {
    const list = byLetter.get(event.letterId)
    if (list) list.push(event)
    else byLetter.set(event.letterId, [event])
  }
  return byLetter
}

function newestFirst(a: TrackedEvent, b: TrackedEvent) {
  return Date.parse(b.at) - Date.parse(a.at) || b.id - a.id
}

// One formatter per timezone and style: the dashboard buckets up to a
// thousand events, and building an Intl.DateTimeFormat is the slow part.
const formatters = new Map<string, Intl.DateTimeFormat>()

export function formatterFor(timeZone: string, style: string, options: Intl.DateTimeFormatOptions, locale = "en-GB") {
  const id = `${timeZone}|${style}`
  let formatter = formatters.get(id)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { timeZone, ...options })
    formatters.set(id, formatter)
  }
  return formatter
}

// "2026-11-22": the calendar day of an instant in a timezone.
export function dayKey(iso: string | Date, timeZone: string): string {
  return formatterFor(timeZone, "day-key", { year: "numeric", month: "2-digit", day: "2-digit" }, "en-CA").format(
    new Date(iso),
  )
}

// The day before a "YYYY-MM-DD" key, by the calendar, so a 23- or 25-hour day
// around a clock change cannot skip or repeat one.
export function previousDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

export type DayGroup = { key: string; label: string; events: TrackedEvent[] }

// Events grouped by calendar day in the viewer's timezone, newest day first:
// "Today", "Yesterday", "Friday 20 November", "3 December 2025".
export function groupByDay(events: TrackedEvent[], timeZone: string, now: Date): DayGroup[] {
  const today = dayKey(now, timeZone)
  const yesterday = previousDay(today)
  const thisYear = today.slice(0, 4)
  const groups: DayGroup[] = []
  for (const event of [...events].sort(newestFirst)) {
    const key = dayKey(event.at, timeZone)
    const last = groups[groups.length - 1]
    if (last?.key === key) {
      last.events.push(event)
      continue
    }
    const label =
      key === today
        ? "Today"
        : key === yesterday
          ? "Yesterday"
          : new Intl.DateTimeFormat("en-GB", {
              timeZone,
              weekday: key.startsWith(thisYear) ? "long" : undefined,
              day: "numeric",
              month: "long",
              year: key.startsWith(thisYear) ? undefined : "numeric",
            }).format(new Date(event.at))
    groups.push({ key, label, events: [event] })
  }
  return groups
}

// "14:05" in the viewer's timezone.
export function timeOfDay(iso: string, timeZone: string): string {
  return formatterFor(timeZone, "time", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

// "Today, 14:05", "Yesterday, 09:12", "21 Nov, 14:05" or "3 Dec 2025, 14:05":
// a gift's first and last open in the viewer's timezone.
export function shortDateTime(iso: string, timeZone: string, now: Date): string {
  const key = dayKey(iso, timeZone)
  const today = dayKey(now, timeZone)
  const time = timeOfDay(iso, timeZone)
  if (key === today) return `Today, ${time}`
  if (key === previousDay(today)) return `Yesterday, ${time}`
  const sameYear = key.slice(0, 4) === today.slice(0, 4)
  const date = formatterFor(timeZone, sameYear ? "short-date" : "short-date-year", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  }).format(new Date(iso))
  return `${date}, ${time}`
}

// ---------- One line of the timeline ----------

export function eventTitle(event: Pick<TrackedEvent, "type" | "day">, kind: LetterKind): string {
  if (event.type === "door_open") return `Opened door ${event.day}`
  if (event.type === "gift_click") return kind === "calendar" && event.day > 0 ? `Tapped the gift behind door ${event.day}` : "Tapped the gift"
  return "Opened"
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" })
const languageNames = new Intl.DisplayNames(["en"], { type: "language" })

// "Germany" for "DE". Falls back to the code.
export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code
  } catch {
    return code
  }
}

// The flag for a two-letter country code, made of two regional indicator
// symbols ("DE" -> 🇩🇪). Empty for anything else.
export function countryFlag(code: string | null): string {
  if (!code || !/^[A-Z]{2}$/.test(code)) return ""
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
}

// "Berlin, Germany", "Germany", or null when no place was recorded.
export function placeName(country: string | null, city: string | null): string | null {
  if (!country) return null
  const name = countryName(country)
  return city ? `${city}, ${name}` : name
}

// "German" for "de". Falls back to the code.
export function languageName(code: string | null): string | null {
  if (!code) return null
  try {
    return languageNames.of(code) ?? code
  } catch {
    return code
  }
}

const DEVICE_NAMES = { phone: "Phone", tablet: "Tablet", desktop: "Computer" } as const

export function deviceName(device: TrackedEvent["device"]): string | null {
  return device ? DEVICE_NAMES[device] : null
}

// ---------- A gift's status ----------

export type TrackerLetter = {
  hasContent: boolean
  stats: { firstOpenedAt: string | null; lastOpenedAt: string | null; totalOpens: number; uniqueVisitors: number }
}

export type TrackerStatus =
  | { state: "draft"; headline: string; detail: string }
  | { state: "waiting"; headline: string; detail: string }
  | { state: "opened"; headline: string; detail: string }

function times(n: number) {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`
}

function people(n: number) {
  return n === 1 ? "one person" : `${n} people`
}

// "Opened by 2 people", "Opened 6 times by one person" (a calendar's page and
// five doors), with "Last opened 2 hours ago" and the gifts tapped under it.
//
// Each visitor is recorded once per event type and door, so a visitor who
// comes back to the same page adds nothing. The number of times is therefore
// the page opens plus the doors opened, and it is only shown when it says more
// than the number of people.
export function trackerStatus(letter: TrackerLetter, events: TrackedEvent[], now: Date): TrackerStatus {
  if (!letter.hasContent) {
    return { state: "draft", headline: "Not finished yet", detail: "It can be opened once the page is made." }
  }
  const { stats } = letter
  const opened = stats.totalOpens > 0 || events.length > 0
  if (!opened || !stats.lastOpenedAt) {
    return { state: "waiting", headline: "Not opened yet", detail: "You'll see it here the moment it is." }
  }
  const doors = events.filter((e) => e.type === "door_open").length
  const taps = events.filter((e) => e.type === "gift_click").length
  const opens = stats.totalOpens + doors
  const visitors = Math.max(stats.uniqueVisitors, 1)
  const headline = opens > visitors ? `Opened ${times(opens)} by ${people(visitors)}` : `Opened by ${people(visitors)}`
  const parts = [`Last opened ${timeAgo(stats.lastOpenedAt, now)}`]
  if (taps > 0) parts.push(`gift tapped ${times(taps)}`)
  return { state: "opened", headline, detail: parts.join(" · ") }
}
