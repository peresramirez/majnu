// Turns a stored letter into what a template receives (PublicLetter).
//
// Pure and free of server-only imports so it can be unit-tested; store.ts
// re-exports it. Everything a recipient's browser gets passes through here, so
// it also re-validates the stored content: signed-in users can write their own
// letter's content columns directly, and nothing unexpected should reach a page.
import {
  CalendarContent,
  CalendarTemplateId,
  LetterContent,
  LetterTemplateId,
  type Gift,
  type LetterRecord,
  type PublicDoor,
  type PublicLetter,
} from "./schema"

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MAX_DOOR = 366

// For calendars, doors that have not opened yet (in the calendar's timezone) keep
// only `day`, `locked` and `opensOn`; with `ownerPreview` every door is open.
// Returns null when the letter has no content or template yet, or when what is
// stored does not match the schema for its kind.
export function toPublicView(letter: LetterRecord, now: Date, opts: { ownerPreview: boolean }): PublicLetter | null {
  if (!letter.content || !letter.templateId) return null
  const ownerPreview = opts.ownerPreview

  if (letter.kind === "letter") {
    const templateId = LetterTemplateId.safeParse(letter.templateId)
    const content = LetterContent.safeParse(letter.content)
    if (!templateId.success || !content.success) return null
    return {
      kind: "letter",
      slug: letter.slug,
      templateId: templateId.data,
      content: { ...content.data, gifts: content.data.gifts.map(safeGift) },
      ownerPreview,
    }
  }

  if (letter.kind === "calendar") {
    const templateId = CalendarTemplateId.safeParse(letter.templateId)
    const content = CalendarContent.safeParse(letter.content)
    if (!templateId.success || !content.success) return null
    if (!parseIsoDate(content.data.startDate)) return null

    const { doors, ...rest } = content.data
    const today = calendarDate(now, rest.timezone)
    const publicDoors: PublicDoor[] = doors
      .filter((door) => door.day >= 1 && door.day <= MAX_DOOR)
      .sort((a, b) => a.day - b.day)
      .map((door): PublicDoor => {
        const opensOn = doorOpensOn(rest.startDate, door.day)
        // YYYY-MM-DD strings compare in date order.
        if (!ownerPreview && opensOn > today) return { day: door.day, locked: true, opensOn }
        return {
          day: door.day,
          locked: false,
          opensOn,
          title: door.title,
          message: door.message,
          ...(door.gift ? { gift: safeGift(door.gift) } : {}),
        }
      })

    return {
      kind: "calendar",
      slug: letter.slug,
      templateId: templateId.data,
      content: { ...rest, doors: publicDoors },
      ownerPreview,
    }
  }

  return null
}

// Today's date (YYYY-MM-DD) in the given IANA timezone. An unknown timezone
// falls back to UTC rather than taking the page down.
export function calendarDate(now: Date, timeZone: string): string {
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
  } catch {
    format = new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", year: "numeric", month: "2-digit", day: "2-digit" })
  }
  // en-CA formats as YYYY-MM-DD; build it from parts so it never depends on that.
  const parts = Object.fromEntries(format.formatToParts(now).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

// Door N opens on startDate + (N - 1) days. Pure calendar arithmetic in UTC,
// so daylight-saving changes cannot shift it.
export function doorOpensOn(startDate: string, day: number): string {
  const start = parseIsoDate(startDate)
  if (!start) throw new Error(`Invalid calendar start date: ${startDate}`)
  return new Date(Date.UTC(start.year, start.month - 1, start.day + (day - 1))).toISOString().slice(0, 10)
}

function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  // Rejects dates such as 2026-02-30 that Date would roll over.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return { year, month, day }
}

// Links and images in a gift must be https (as the schema describes); anything
// else is dropped so a stored value cannot become a script or data link.
function safeGift(gift: Gift): Gift {
  const { url, imageUrl, ...rest } = gift
  return {
    ...rest,
    ...(isHttps(url) ? { url } : {}),
    ...(isHttps(imageUrl) ? { imageUrl } : {}),
  }
}

function isHttps(value: string | undefined): value is string {
  if (!value) return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}
