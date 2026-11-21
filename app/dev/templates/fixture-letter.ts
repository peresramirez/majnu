// Turns a fixture into what a template receives, without the database.
// `live` locks calendar doors as the public page would today; otherwise every
// door is open, as in the owner's preview.
import { previewCalendar } from "@/components/calendars/dates"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import {
  CALENDAR_TEMPLATE_IDS,
  LETTER_TEMPLATE_IDS,
  type CalendarTemplateId,
  type LetterTemplateId,
  type PublicLetter,
  type TemplateId,
  type Theme,
} from "@/lib/letters/schema"

export const PALETTES: Theme["palette"][] = ["night", "petal", "rose", "sage", "ink"]
export const FONTS: Theme["font"][] = ["serif", "sans", "script"]

export function isTemplateId(id: string): id is TemplateId {
  return (LETTER_TEMPLATE_IDS as readonly string[]).includes(id) || (CALENDAR_TEMPLATE_IDS as readonly string[]).includes(id)
}

export function fixtureLetter(
  id: TemplateId,
  opts: { now: Date; live?: boolean; palette?: string; font?: string },
): PublicLetter {
  const palette = PALETTES.includes(opts.palette as Theme["palette"]) ? (opts.palette as Theme["palette"]) : undefined
  const font = FONTS.includes(opts.font as Theme["font"]) ? (opts.font as Theme["font"]) : undefined

  if ((CALENDAR_TEMPLATE_IDS as readonly string[]).includes(id)) {
    const templateId = id as CalendarTemplateId
    const base = calendarFixtures[templateId]
    const theme = { palette: palette ?? base.theme.palette, font: font ?? base.theme.font }
    return {
      kind: "calendar",
      slug: `dev-${id}`,
      templateId,
      content: previewCalendar({ ...base, theme }, { now: opts.now, allOpen: !opts.live }),
      // The workbench never reports events, even with real locking.
      ownerPreview: true,
    }
  }

  const templateId = id as LetterTemplateId
  const base = letterFixtures[templateId]
  return {
    kind: "letter",
    slug: `dev-${id}`,
    templateId,
    content: { ...base, theme: { palette: palette ?? base.theme.palette, font: font ?? base.theme.font } },
    ownerPreview: true,
  }
}
