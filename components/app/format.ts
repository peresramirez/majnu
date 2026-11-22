// Dates in the brand's voice: "Opened 2 hours ago", "Made 21 Nov".
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" })

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["minute", 60],
  ["hour", 3_600],
  ["day", 86_400],
  ["week", 604_800],
  ["month", 2_629_800],
  ["year", 31_557_600],
]

// "just now", "5 minutes ago", "yesterday", "3 weeks ago".
export function timeAgo(iso: string, now: Date): string {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000
  const abs = Math.abs(seconds)
  if (!Number.isFinite(abs)) return ""
  if (abs < 60) return "just now"
  let unit: Intl.RelativeTimeFormatUnit = "minute"
  let size = 60
  for (const [u, s] of UNITS) if (abs >= s) [unit, size] = [u, s]
  return relative.format(Math.round(seconds / size), unit)
}

// "21 Nov", or "21 Nov 2025" outside the current year.
export function shortDate(iso: string, now: Date): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  }).format(date)
}

export function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`
}

// A recipient's name as the sender's own lists show it (My gifts, the
// Tracker). A single word typed all in lower case gets a capital, so
// "patricia" reads "Patricia"; the stored name is unchanged. Anything longer
// stays as typed: "our friends", "van der Berg" or "Mia & Leo" are right as
// they are, and only the sender knows.
export function displayName(name: string): string {
  const clean = name.trim()
  if (!/^\p{Ll}[\p{Ll}'’-]*$/u.test(clean)) return clean
  return clean.charAt(0).toLocaleUpperCase() + clean.slice(1)
}
