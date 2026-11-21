// Calendar dates as plain "YYYY-MM-DD" strings. Door N opens on
// startDate + (N - 1) days, compared as calendar dates in the calendar's own
// timezone (docs/plan.md, "Calendar unlocks"), never as timestamps.
import type { CalendarContent, PublicCalendarContent, PublicDoor } from "@/lib/letters/schema"

const DATE = /^(\d{4})-(\d{2})-(\d{2})/

function parts(date: string): [number, number, number] | null {
  const m = DATE.exec(date ?? "")
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

// Today's date where the recipient lives, e.g. "2026-12-03".
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  try {
    return format(timeZone)
  } catch {
    return format("UTC")
  }
}

export function addDays(date: string, days: number): string {
  const p = parts(date)
  if (!p) return date
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + days)).toISOString().slice(0, 10)
}

export function opensOnFor(startDate: string, day: number): string {
  return addDays(startDate, day - 1)
}

function asUtc(date: string): Date | null {
  const p = parts(date)
  return p ? new Date(Date.UTC(p[0], p[1] - 1, p[2])) : null
}

// "3 December" (long) or "3 Dec" (short). Accepts a full ISO timestamp too.
export function formatDay(date: string, style: "long" | "short" = "long"): string {
  const d = asUtc(date)
  if (!d) return date
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: style, timeZone: "UTC" }).format(d)
}

// { day: "3", month: "Dec", weekday: "Thu" } for tear-off calendar pages.
export function dayParts(date: string) {
  const d = asUtc(date)
  if (!d) return { day: date, month: "", weekday: "" }
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { ...o, timeZone: "UTC" }).format(d)
  return { day: f({ day: "numeric" }), month: f({ month: "short" }), weekday: f({ weekday: "short" }) }
}

// Whole days from `from` to `to`; negative when `to` is earlier.
export function daysBetween(from: string, to: string): number {
  const a = asUtc(from)
  const b = asUtc(to)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

// A calendar as a template would receive it, built from full content. This is
// for /dev/templates only, which renders fixtures without the database; the
// real public view comes from toPublicView() in lib/letters/store.ts. Locked
// doors keep only day, locked and opensOn, as the contract requires.
export function previewCalendar(
  content: CalendarContent,
  opts: { now: Date; allOpen: boolean },
): PublicCalendarContent {
  const today = todayIn(content.timezone, opts.now)
  const doors: PublicDoor[] = content.doors.map((door) => {
    const opensOn = opensOnFor(content.startDate, door.day)
    if (!opts.allOpen && opensOn > today) return { day: door.day, locked: true, opensOn }
    const { day, ...rest } = door
    return { day, locked: false, opensOn, ...rest }
  })
  return { ...content, doors }
}
