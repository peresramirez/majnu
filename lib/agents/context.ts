// Per-request facts (today's date, the sender's timezone) go in the user turn,
// never in a system prompt, so system prompts and tools stay byte-stable and
// cacheable. The main agent's user turns start with a block tagged CONTEXT_TAG;
// toDisplayMessages() hides it when a conversation is shown again.

export const CONTEXT_TAG = "<context>"

// Most senders arrive from ads in Germany; used when the browser sends no
// timezone or one the runtime does not know.
export const DEFAULT_TIMEZONE = "Europe/Berlin"

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone })
    return true
  } catch {
    return false
  }
}

export function resolveTimezone(timezone: string | undefined | null): string {
  const trimmed = timezone?.trim()
  return trimmed && trimmed.length <= 64 && isValidTimezone(trimmed) ? trimmed : DEFAULT_TIMEZONE
}

// YYYY-MM-DD in the given timezone.
export function dateIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
}

function weekdayIn(timezone: string, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, weekday: "long" }).format(now)
}

// "+01:00", for ISO 8601 times with an offset.
export function utcOffsetIn(timezone: string, now: Date): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "longOffset" })
    .formatToParts(now)
    .find((p) => p.type === "timeZoneName")?.value
  const offset = part?.replace("GMT", "") ?? ""
  return offset === "" ? "+00:00" : offset
}

// One line the models can rely on for dates: "Today is Saturday 2026-11-21 in
// Europe/Berlin (UTC+01:00)."
export function describeToday(timezone: string, now: Date): string {
  return `Today is ${weekdayIn(timezone, now)} ${dateIn(timezone, now)} in ${timezone} (UTC${utcOffsetIn(timezone, now)}).`
}

// `extra` adds per-request facts after the date, such as a gift that is
// already built (builtGiftNote in main.ts).
export function contextBlockText(timezone: string, now: Date, extra?: string | null): string {
  return `${CONTEXT_TAG}${describeToday(timezone, now)} The sender's timezone is ${timezone}.${extra ? ` ${extra}` : ""}</context>`
}
