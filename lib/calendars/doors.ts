// Filling a calendar door by door (issue #48). Pure and free of server-only
// imports, so the editor in the browser and the routes on the server share one
// idea of what a filled door is, and it can be unit-tested.
//
// A door is filled when it has a gift or a note. Sharing opens once every door
// is filled. A gift picked from Majnu's ideas is copied onto CalendarDoor.gift
// exactly as it was shown (title, description, link, price), without its
// product image: gift pages load nothing from other sites, and a shop's image
// URL would tell that shop who opened the door and when (the same rule as
// lib/finder/wrap.ts).
import type { CalendarContent, CalendarDoor, CalendarTemplateId, Gift, Theme } from "@/lib/letters/schema"
import type { GiftOption } from "@/lib/finder/events"

export const ADVENT_DOORS = 24
export const MAX_COUNTDOWN_DAYS = 31

// What a sender may type into a door. The builder's own notes are cut to the same.
export const NOTE_LIMITS = { title: 80, message: 600 } as const
export const OWN_GIFT_LIMITS = { title: 120, description: 300, url: 2048, price: 40, code: 120 } as const

export type Progress = { filled: number; total: number }

export function doorCount(templateId: CalendarTemplateId, days?: number): number {
  if (templateId === "advent-classic") return ADVENT_DOORS
  const n = Math.round(days ?? 0)
  return Math.max(1, Math.min(MAX_COUNTDOWN_DAYS, Number.isFinite(n) && n > 0 ? n : 7))
}

export function emptyDoors(count: number): CalendarDoor[] {
  return Array.from({ length: count }, (_, i) => ({ day: i + 1, title: "", message: "" }))
}

export function hasNote(door: Pick<CalendarDoor, "message">): boolean {
  return door.message.trim().length > 0
}

export function doorFilled(door: CalendarDoor): boolean {
  return Boolean(door.gift) || hasNote(door)
}

export function calendarProgress(content: Pick<CalendarContent, "doors">): Progress {
  return { filled: content.doors.filter(doorFilled).length, total: content.doors.length }
}

// Sharing opens once every door has a gift or a note.
export function shareReady(content: Pick<CalendarContent, "doors">): boolean {
  const { filled, total } = calendarProgress(content)
  return total > 0 && filled === total
}

// ---------- Gifts ----------

export function isHttpsUrl(value: string | undefined | null): value is string {
  if (!value) return false
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function clip(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim()
  return trimmed ? trimmed.slice(0, max) : undefined
}

// One of Majnu's ideas as the door's gift. Never imageUrl (see above), never a
// code: a shop product has none.
export function giftFromOption(option: GiftOption): Gift {
  const description = clip(option.description, OWN_GIFT_LIMITS.description)
  const price = clip(option.price, OWN_GIFT_LIMITS.price)
  return {
    title: clip(option.title, OWN_GIFT_LIMITS.title) ?? option.title,
    ...(description ? { description } : {}),
    ...(isHttpsUrl(option.url) ? { url: option.url } : {}),
    ...(price ? { price } : {}),
  }
}

export type OwnGiftInput = { title: string; description?: string; url?: string; price?: string; code?: string }

export type OwnGiftResult = { ok: true; gift: Gift } | { ok: false; problem: "title" | "url" }

// A gift the sender adds themselves: a title, and optionally a link (https
// only), a price and a voucher code. The code is shown only once the recipient
// opens the door, like every gift code.
export function ownGift(input: OwnGiftInput): OwnGiftResult {
  const title = clip(input.title, OWN_GIFT_LIMITS.title)
  if (!title) return { ok: false, problem: "title" }
  const url = input.url?.trim()
  if (url && (!isHttpsUrl(url) || url.length > OWN_GIFT_LIMITS.url)) return { ok: false, problem: "url" }
  const description = clip(input.description, OWN_GIFT_LIMITS.description)
  const price = clip(input.price, OWN_GIFT_LIMITS.price)
  // Codes keep their spaces and case: some are typed exactly as printed.
  const code = input.code?.trim().slice(0, OWN_GIFT_LIMITS.code) || undefined
  return {
    ok: true,
    gift: { title, ...(description ? { description } : {}), ...(url ? { url } : {}), ...(price ? { price } : {}), ...(code ? { code } : {}) },
  }
}

// Which idea a door's gift came from, for the editor's thumbnails. Ideas are
// matched by link, since the door keeps no id.
export function optionForGift(gift: Gift | undefined, pool: readonly GiftOption[]): GiftOption | undefined {
  if (!gift?.url) return undefined
  return pool.find((option) => option.url === gift.url)
}

// ---------- Doors ----------

export type DoorInput = { gift?: Gift; title: string; message: string }

export function cleanNote(note: { title: string; message: string }): { title: string; message: string } {
  return {
    title: (note.title ?? "").replace(/\s+/g, " ").trim().slice(0, NOTE_LIMITS.title),
    // Line breaks inside a note are kept; only the ends are trimmed.
    message: (note.message ?? "").trim().slice(0, NOTE_LIMITS.message),
  }
}

// The content with one door replaced. Null when the calendar has no such door.
export function setDoor(content: CalendarContent, day: number, input: DoorInput): CalendarContent | null {
  const index = content.doors.findIndex((door) => door.day === day)
  if (index < 0) return null
  const note = cleanNote(input)
  const door: CalendarDoor = { day, ...note, ...(input.gift ? { gift: input.gift } : {}) }
  return { ...content, doors: content.doors.map((d, i) => (i === index ? door : d)) }
}

// Majnu's notes, written for every door at once by one builder call, merged into
// the doors as they are now. Notes the sender wrote are kept as they are, and
// every gift stays exactly as picked: only empty notes are filled. The headline
// and intro are taken only while they are still the defaults.
export function mergeNotes(
  current: CalendarContent,
  written: Pick<CalendarContent, "headline" | "intro" | "doors">,
  templateId: CalendarTemplateId,
): { content: CalendarContent; written: number } {
  let count = 0
  const doors = current.doors.map((door, index) => {
    if (hasNote(door)) return door
    const fromBuilder = written.doors[index]
    if (!fromBuilder) return door
    const note = cleanNote({ title: fromBuilder.title, message: fromBuilder.message })
    if (!note.message) return door
    count++
    return { ...door, title: note.title || door.title, message: note.message }
  })
  const defaults = defaultCover(current.recipientName, current.doors.length, templateId)
  const headline = current.headline.trim() === "" || current.headline === defaults.headline ? clip(written.headline, 80) : undefined
  const intro = current.intro.trim() === "" || current.intro === defaults.intro ? clip(written.intro, 300) : undefined
  return {
    content: { ...current, ...(headline ? { headline } : {}), ...(intro ? { intro } : {}), doors },
    written: count,
  }
}

// ---------- Dates and defaults ----------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

// Today (YYYY-MM-DD) in a timezone; UTC when the timezone is unknown.
export function todayIn(timeZone: string, now: Date): string {
  const format = (tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now)
  try {
    return format(timeZone)
  } catch {
    return format("UTC")
  }
}

// 1 December of this year, or of next year once this year's Christmas has
// passed (the same rule the builder follows).
export function defaultAdventStart(now: Date, timeZone: string): string {
  const today = todayIn(timeZone, now)
  const year = Number(today.slice(0, 4))
  return today > `${year}-12-24` ? `${year + 1}-12-01` : `${year}-12-01`
}

// A countdown's last door opens on the big day itself.
export function countdownStart(bigDay: string, days: number): string {
  return addDays(bigDay, -(Math.max(1, days) - 1))
}

export function defaultCover(recipientName: string, doors: number, templateId: CalendarTemplateId): { headline: string; intro: string } {
  const name = recipientName.trim() || "you"
  if (templateId === "advent-classic") {
    return { headline: `${doors} doors for ${name}`, intro: "One door opens each day until Christmas Eve." }
  }
  return {
    headline: doors === 1 ? `One day to go, ${name}` : `${doors} days to go, ${name}`,
    intro: "One page a day until the big day.",
  }
}

export function defaultTheme(templateId: CalendarTemplateId): Theme {
  return templateId === "advent-classic" ? { palette: "night", font: "serif" } : { palette: "petal", font: "sans" }
}

// A new calendar with every door empty, ready to be filled.
export function initialContent(input: {
  templateId: CalendarTemplateId
  days?: number
  recipientName: string
  senderName: string
  startDate: string
  timezone: string
}): CalendarContent {
  const count = doorCount(input.templateId, input.days)
  const cover = defaultCover(input.recipientName, count, input.templateId)
  return {
    recipientName: input.recipientName.trim(),
    senderName: input.senderName.trim(),
    headline: cover.headline,
    intro: cover.intro,
    startDate: input.startDate,
    timezone: input.timezone,
    theme: defaultTheme(input.templateId),
    doors: emptyDoors(count),
  }
}
