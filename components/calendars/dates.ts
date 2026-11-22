// Calendar dates as plain "YYYY-MM-DD" strings, as PublicDoor.opensOn carries
// them. Which doors are locked is decided on the server (toPublicView in
// lib/letters/public-view.ts); these helpers only label doors and find today.

const DATE = /^(\d{4})-(\d{2})-(\d{2})/

function asUtc(date: string): Date | null {
  const m = DATE.exec(date ?? "")
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null
}

// Today's date where the recipient lives, e.g. "2026-12-03". Used only to mark
// today's door; an unknown timezone falls back to UTC.
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const format = (tz: string) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  try {
    return format(timeZone)
  } catch {
    return format("UTC")
  }
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
