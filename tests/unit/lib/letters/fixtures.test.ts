import { describe, expect, it } from "vitest"
import { calendarFixtures, demoSlugs, letterFixtures } from "@/lib/letters/fixtures"
import { CALENDAR_TEMPLATE_IDS, CalendarContent, LETTER_TEMPLATE_IDS, LetterContent } from "@/lib/letters/schema"
import { templates } from "@/lib/letters/templates"

describe("letter fixtures", () => {
  it.each(LETTER_TEMPLATE_IDS)("%s parses as LetterContent", (id) => {
    expect(LetterContent.safeParse(letterFixtures[id]).success).toBe(true)
  })

  it("gives invitations an event", () => {
    expect(letterFixtures["wedding-invite"].event).toBeDefined()
    expect(letterFixtures["party-invite"].event).toBeDefined()
  })
})

describe("calendar fixtures", () => {
  it.each(CALENDAR_TEMPLATE_IDS)("%s parses as CalendarContent", (id) => {
    expect(CalendarContent.safeParse(calendarFixtures[id]).success).toBe(true)
  })

  it("has 24 doors numbered 1 to 24 in the advent calendar", () => {
    expect(calendarFixtures["advent-classic"].doors.map((d) => d.day)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1))
  })

  it("uses a valid IANA timezone", () => {
    for (const c of Object.values(calendarFixtures)) {
      expect(() => new Intl.DateTimeFormat("en-CA", { timeZone: c.timezone })).not.toThrow()
    }
  })
})

describe("template metadata", () => {
  it("lists every template id exactly once, with the right kind", () => {
    const ids = templates.map((t) => t.id).sort()
    expect(ids).toEqual([...LETTER_TEMPLATE_IDS, ...CALENDAR_TEMPLATE_IDS].sort())
    for (const t of templates) {
      expect(t.kind).toBe((CALENDAR_TEMPLATE_IDS as readonly string[]).includes(t.id) ? "calendar" : "letter")
    }
  })

  it("points every demo slug at a template of the matching kind", () => {
    for (const demo of Object.values(demoSlugs)) {
      expect(templates.find((t) => t.id === demo.templateId)?.kind).toBe(demo.kind)
    }
  })
})
