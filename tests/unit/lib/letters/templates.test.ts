import { describe, expect, it } from "vitest"
import { CALENDAR_TEMPLATE_IDS } from "@/lib/letters/schema"
import { getTemplate, templateCategories, templates } from "@/lib/letters/templates"

describe("template categories (the Templates tab's groups)", () => {
  it("puts every template in a known group", () => {
    const known = new Set(templateCategories.map((c) => c.id))
    for (const t of templates) expect(known.has(t.category)).toBe(true)
  })

  it("has at least one template in every group", () => {
    for (const c of templateCategories) expect(templates.some((t) => t.category === c.id)).toBe(true)
  })

  it("groups calendars, and only calendars, as calendars", () => {
    for (const t of templates) expect(t.category === "calendar").toBe((CALENDAR_TEMPLATE_IDS as readonly string[]).includes(t.id))
  })

  it("has unique names, because the chat chooses a template by name", () => {
    const names = templates.map((t) => t.name.toLowerCase())
    expect(new Set(names).size).toBe(names.length)
  })

  it("lists the templates from the prototype archive (issue #40)", () => {
    expect(getTemplate("gift-box-3d")).toMatchObject({ kind: "letter", category: "gift", plan: "free" })
    expect(getTemplate("party-box")).toMatchObject({ kind: "letter", category: "gift", plan: "free" })
    expect(getTemplate("treasure-map")).toMatchObject({ kind: "letter", category: "letter", plan: "free" })
  })

  it("lists the 3D wedding envelope as an invitation (issue #52)", () => {
    const t = getTemplate("wedding-envelope-3d")
    expect(t).toMatchObject({ kind: "letter", category: "invitation", name: "3D wedding envelope", plan: "free" })
    // The builder reads the description: it must ask for the event.
    expect(t?.description).toMatch(/date, time and place/)
    expect(t?.bestFor).toContain("weddings")
  })
})
