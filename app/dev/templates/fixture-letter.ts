// Turns a fixture into what a template receives, through the same
// toPublicView() the public page uses, without the database.
//
// Calendars show every door open, as in the owner's preview, unless `live` or
// `today` asks for real locking: `live` locks doors as the public page would
// right now, `today` (YYYY-MM-DD) as it would on that date. `days` rebuilds the
// countdown with that many doors, and `noEvent` removes an invitation's event.
// `guest` renders the page as a guest sees it rather than as the owner's
// preview, so a gift list's "I'll bring this" buttons work (a claim then gets
// "not found" from POST /api/claim, because fixtures are not in the database).
import type { LetterAudio } from "@/components/letters/audio-note"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { toPublicView } from "@/lib/letters/public-view"
import {
  CALENDAR_TEMPLATE_IDS,
  LETTER_TEMPLATE_IDS,
  type CalendarContent,
  type CalendarDoor,
  type CalendarTemplateId,
  type LetterContent,
  type LetterRecord,
  type LetterTemplateId,
  type PublicLetter,
  type TemplateId,
  type Theme,
} from "@/lib/letters/schema"

export const PALETTES: Theme["palette"][] = ["night", "petal", "rose", "sage", "ink"]
export const FONTS: Theme["font"][] = ["serif", "sans", "script"]

// The countdown schema allows 1 to 31 doors.
export const MAX_COUNTDOWN_DAYS = 31

const isCalendar = (id: string): id is CalendarTemplateId => (CALENDAR_TEMPLATE_IDS as readonly string[]).includes(id)

export function isTemplateId(id: string): id is TemplateId {
  return (LETTER_TEMPLATE_IDS as readonly string[]).includes(id) || isCalendar(id)
}

// "2026-12-12" -> noon UTC that day, which is the same date in every timezone
// from UTC-11 to UTC+11. Anything else is ignored.
export function parseToday(value: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "")
  if (!m) return null
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12))
  return date.toISOString().startsWith(value!) ? date : null
}

export function parseDays(value: string | undefined): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1 && n <= MAX_COUNTDOWN_DAYS ? n : null
}

const extraNotes = [
  "Still a while to go. Good things are worth the wait.",
  "Pick a film for the night before. I'll bring snacks.",
  "Write down three things you want to do when we get there.",
  "A song for today: the one we played on repeat last summer.",
  "Halfway feeling: you're doing great at waiting.",
  "Check the weather there. Then pack for the opposite.",
]

// The countdown fixture with `days` doors. The last seven are the fixture's
// own; longer countdowns get generic notes before them, so door N still opens
// on startDate + (N - 1) days and the final door is the day before the trip.
export function countdownDoors(days: number): CalendarDoor[] {
  const own = calendarFixtures.countdown.doors
  return Array.from({ length: days }, (_, i) => {
    const toGo = days - i
    const fixture = own[own.length - toGo]
    const base = fixture
      ? { title: fixture.title, message: fixture.message, ...(fixture.gift ? { gift: fixture.gift } : {}) }
      : { title: `${toGo} to go`, message: extraNotes[i % extraNotes.length] }
    return { day: i + 1, ...base }
  })
}

export function fixtureLetter(
  id: TemplateId,
  opts: { now: Date; live?: boolean; today?: Date | null; days?: number | null; noEvent?: boolean; guest?: boolean; palette?: string; font?: string },
): PublicLetter | null {
  let base: LetterContent | CalendarContent = isCalendar(id) ? calendarFixtures[id] : letterFixtures[id as LetterTemplateId]
  if (id === "countdown" && opts.days) base = { ...(base as CalendarContent), doors: countdownDoors(opts.days) }
  if (opts.noEvent && "event" in base) {
    const { event: _event, ...rest } = base
    base = rest
  }
  const theme = {
    palette: PALETTES.includes(opts.palette as Theme["palette"]) ? (opts.palette as Theme["palette"]) : base.theme.palette,
    font: FONTS.includes(opts.font as Theme["font"]) ? (opts.font as Theme["font"]) : base.theme.font,
  }
  const now = opts.today ?? opts.now
  const locked = Boolean(opts.live || opts.today)
  const at = now.toISOString()
  const record: LetterRecord = {
    id: `dev-${id}`,
    ownerId: "dev",
    slug: `dev-${id}`,
    kind: isCalendar(id) ? "calendar" : "letter",
    templateId: id,
    title: null,
    content: { ...base, theme },
    createdAt: at,
    updatedAt: at,
  }
  const view = toPublicView(record, now, { ownerPreview: !locked })
  // The workbench reports no events, even with real locking, unless it is
  // asked to show the guest's page (open tracking ignores the dev- slugs'
  // unknown letters anyway).
  return view ? { ...view, ownerPreview: !opts.guest } : null
}

// The sample voice note for ?audio=1: seven seconds of a synthesised voice
// (macOS `say`, AAC in an .m4a, 42 KB) in public/dev/, so the voice player's
// waveform has something to follow on every template. Served from our own
// domain like a real note, and fetched only on the first tap.
export const SAMPLE_AUDIO_PATH = "/dev/voice-note.m4a"

export function sampleAudio(): LetterAudio {
  // The length matches the clip, so the time is right before it has loaded.
  return {
    src: SAMPLE_AUDIO_PATH,
    seconds: 7,
    caption: "Hi! This is a little voice note, recorded just for you. I hope it makes you smile. Open it whenever you like.",
  }
}
