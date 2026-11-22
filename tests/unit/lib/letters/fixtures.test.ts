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
    expect(letterFixtures["wedding-envelope-3d"].event).toBeDefined()
  })

  it("gives the 3D wedding envelope a real date, a gift list and no gift codes", () => {
    const f = letterFixtures["wedding-envelope-3d"]
    // Saturday 13 February 2027, 18:00 in Lahore.
    expect(new Date(f.event!.startsAt).toISOString()).toBe("2027-02-13T13:00:00.000Z")
    expect(new Date(f.event!.startsAt).getUTCDay()).toBe(6)
    const ids = (f.wishlist ?? []).map((item) => item.id)
    expect(ids.length).toBeGreaterThanOrEqual(3)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{1,64}$/)
    expect(f.gifts.every((g) => !g.code)).toBe(true)
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
