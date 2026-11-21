// Dates, times, maps and calendar files for invitations. Pure functions, so the
// server render and the browser agree, and so they can be tested.
//
// An event's `startsAt` is local time with an offset (2026-12-24T19:00:00+01:00).
// We show the local wall-clock time exactly as written, whatever the viewer's
// timezone, and use the offset only to know the real instant for the countdown
// and the calendar file.

export type EventStart = {
  year: number
  month: number // 1-12
  day: number
  hour: number
  minute: number
  // The real moment the event starts.
  instant: Date
}

const ISO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i

export function parseEventStart(startsAt: string | null | undefined): EventStart | null {
  const m = ISO_LOCAL.exec((startsAt ?? "").trim())
  if (!m) return null
  const [year, month, day, hour, minute, second] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? "0"].map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null
  let offsetMinutes = 0
  const zone = m[7]
  if (zone && zone.toUpperCase() !== "Z") {
    const sign = zone.startsWith("-") ? -1 : 1
    const digits = zone.slice(1).replace(":", "")
    offsetMinutes = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)))
  }
  const utc = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000
  return { year, month, day, hour, minute, instant: new Date(utc) }
}

// The wall-clock components as a UTC date, so Intl formats them unchanged.
function wallClock(s: EventStart): Date {
  return new Date(Date.UTC(s.year, s.month - 1, s.day, s.hour, s.minute))
}

function fmt(s: EventStart, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" }).format(wallClock(s))
}

// "Saturday 12 June 2027"
export function formatEventDate(s: EventStart): string {
  return `${fmt(s, { weekday: "long" })} ${fmt(s, { day: "numeric", month: "long", year: "numeric" })}`
}

// "Sat", "12", "Jun", "June", "2027" for layouts that split the date.
export function eventDateParts(s: EventStart) {
  return {
    weekdayShort: fmt(s, { weekday: "short" }),
    weekday: fmt(s, { weekday: "long" }),
    day: String(s.day),
    monthShort: fmt(s, { month: "short" }),
    month: fmt(s, { month: "long" }),
    year: String(s.year),
  }
}

// "3 pm" on the hour, otherwise "8:30 pm".
export function formatEventTime(s: EventStart): string {
  const h12 = s.hour % 12 || 12
  const suffix = s.hour < 12 ? "am" : "pm"
  return s.minute === 0 ? `${h12} ${suffix}` : `${h12}:${String(s.minute).padStart(2, "0")} ${suffix}`
}

export type Countdown = { days: number; hours: number; minutes: number; seconds: number; past: boolean }

export function countdownTo(target: Date, now: Date): Countdown {
  const diff = target.getTime() - now.getTime()
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, past: true }
  const total = Math.floor(diff / 1000)
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
    past: false,
  }
}

// A Google Maps search for the place. A plain link: no embedded map, no script.
export function mapsUrl(locationName: string, address: string): string {
  const query = [locationName, address].map((s) => s?.trim()).filter(Boolean).join(", ")
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

// ---------- iCalendar (RFC 5545) ----------

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n")
}

// Lines longer than 75 octets continue on the next line after a space.
function fold(line: string): string {
  const out: string[] = []
  let current = ""
  let bytes = 0
  for (const ch of line) {
    const size = new TextEncoder().encode(ch).length
    if (bytes + size > (out.length === 0 ? 75 : 74)) {
      out.push(current)
      current = ""
      bytes = 0
    }
    current += ch
    bytes += size
  }
  out.push(current)
  return out.join("\r\n ")
}

export type IcsInput = {
  uid: string
  title: string
  start: Date
  durationMinutes?: number
  location?: string
  description?: string
  url?: string
  now?: Date
}

export function buildIcs(input: IcsInput): string {
  const end = new Date(input.start.getTime() + (input.durationMinutes ?? 180) * 60_000)
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Majnu//Invitation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${icsDate(input.now ?? new Date())}`,
    `DTSTART:${icsDate(input.start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(input.title)}`,
    ...(input.location ? [`LOCATION:${icsText(input.location)}`] : []),
    ...(input.description ? [`DESCRIPTION:${icsText(input.description)}`] : []),
    ...(input.url ? [`URL:${input.url}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.map(fold).join("\r\n") + "\r\n"
}

// "Clara and Ben's wedding" -> "clara-and-bens-wedding.ics"
export function icsFileName(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${base || "invitation"}.ics`
}
