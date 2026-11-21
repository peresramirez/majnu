// Turns a fixture into what a template receives, through the same
// toPublicView() the public page uses, without the database. `live` locks
// calendar doors as the public page would today; otherwise every door is open,
// as in the owner's preview.
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { toPublicView } from "@/lib/letters/public-view"
import {
  CALENDAR_TEMPLATE_IDS,
  LETTER_TEMPLATE_IDS,
  type CalendarTemplateId,
  type LetterRecord,
  type LetterTemplateId,
  type PublicLetter,
  type TemplateId,
  type Theme,
} from "@/lib/letters/schema"

export const PALETTES: Theme["palette"][] = ["night", "petal", "rose", "sage", "ink"]
export const FONTS: Theme["font"][] = ["serif", "sans", "script"]

const isCalendar = (id: string): id is CalendarTemplateId => (CALENDAR_TEMPLATE_IDS as readonly string[]).includes(id)

export function isTemplateId(id: string): id is TemplateId {
  return (LETTER_TEMPLATE_IDS as readonly string[]).includes(id) || isCalendar(id)
}

export function fixtureLetter(
  id: TemplateId,
  opts: { now: Date; live?: boolean; palette?: string; font?: string },
): PublicLetter | null {
  const base = isCalendar(id) ? calendarFixtures[id] : letterFixtures[id as LetterTemplateId]
  const theme = {
    palette: PALETTES.includes(opts.palette as Theme["palette"]) ? (opts.palette as Theme["palette"]) : base.theme.palette,
    font: FONTS.includes(opts.font as Theme["font"]) ? (opts.font as Theme["font"]) : base.theme.font,
  }
  const at = opts.now.toISOString()
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
  const view = toPublicView(record, opts.now, { ownerPreview: !opts.live })
  // The workbench never reports events, even with real locking.
  return view ? { ...view, ownerPreview: true } : null
}
