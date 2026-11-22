import { describe, expect, it } from "vitest"
import {
  countLabel,
  FILTER_CHIPS,
  filterCounts,
  filterParam,
  filterSearch,
  matchesFilter,
  parseTemplateFilter,
  templatesFor,
} from "@/app/(app)/dashboard/templates/filter"
import { templateCategories, templates, type TemplateMeta } from "@/lib/letters/templates"

describe("parseTemplateFilter (?type= in the address)", () => {
  it("reads each group's value", () => {
    expect(parseTemplateFilter("gifts")).toBe("gift")
    expect(parseTemplateFilter("letters")).toBe("letter")
    expect(parseTemplateFilter("invitations")).toBe("invitation")
    expect(parseTemplateFilter("calendars")).toBe("calendar")
  })

  it("accepts the singular and any letter case", () => {
    expect(parseTemplateFilter("gift")).toBe("gift")
    expect(parseTemplateFilter(" Invitations ")).toBe("invitation")
    expect(parseTemplateFilter("CALENDAR")).toBe("calendar")
  })

  it("falls back to All for nothing, unknown values and junk", () => {
    expect(parseTemplateFilter(undefined)).toBe("all")
    expect(parseTemplateFilter(null)).toBe("all")
    expect(parseTemplateFilter("")).toBe("all")
    expect(parseTemplateFilter("all")).toBe("all")
    expect(parseTemplateFilter("weddings")).toBe("all")
    expect(parseTemplateFilter("gifts;drop table")).toBe("all")
    expect(parseTemplateFilter("__proto__")).toBe("all")
  })

  it("takes the first of repeated values", () => {
    expect(parseTemplateFilter(["letters", "gifts"])).toBe("letter")
    expect(parseTemplateFilter([])).toBe("all")
  })

  it("round-trips every chip through the address", () => {
    for (const chip of FILTER_CHIPS) {
      const query = filterSearch(chip.id)
      expect(parseTemplateFilter(new URLSearchParams(query).get("type"))).toBe(chip.id)
    }
  })
})

describe("filterSearch", () => {
  it("writes ?type= for a group and nothing for All", () => {
    expect(filterSearch("gift")).toBe("?type=gifts")
    expect(filterSearch("calendar", "")).toBe("?type=calendars")
    expect(filterSearch("all")).toBe("")
    expect(filterSearch("all", "?type=gifts")).toBe("")
    expect(filterParam("all")).toBeNull()
  })

  it("keeps every other parameter as it is", () => {
    expect(filterSearch("letter", "?type=gifts&ref=ad")).toBe("?type=letters&ref=ad")
    expect(filterSearch("all", "?ref=ad&type=gifts")).toBe("?ref=ad")
    expect(filterSearch("invitation", "?utm_source=x")).toBe("?utm_source=x&type=invitations")
  })
})

describe("which templates a filter shows", () => {
  it("shows every template under All", () => {
    expect(templatesFor("all")).toHaveLength(templates.length)
  })

  it("shows only the chosen group, and every group adds up to All", () => {
    let sum = 0
    for (const c of templateCategories) {
      const shown = templatesFor(c.id)
      expect(shown.length).toBeGreaterThan(0)
      for (const t of shown) expect(t.category).toBe(c.id)
      sum += shown.length
    }
    expect(sum).toBe(templates.length)
  })

  it("puts the 3D wedding envelope under Invitations", () => {
    expect(templatesFor("invitation").map((t) => t.id)).toContain("wedding-envelope-3d")
    expect(templatesFor("gift").map((t) => t.id)).not.toContain("wedding-envelope-3d")
  })

  it("matches categories", () => {
    expect(matchesFilter("all", "calendar")).toBe(true)
    expect(matchesFilter("gift", "gift")).toBe(true)
    expect(matchesFilter("gift", "letter")).toBe(false)
  })
})

describe("chips and counts", () => {
  it("has All first, then one chip per group", () => {
    expect(FILTER_CHIPS.map((c) => c.id)).toEqual(["all", ...templateCategories.map((c) => c.id)])
    expect(FILTER_CHIPS.map((c) => c.label)).toEqual(["All", "Gifts", "Letters", "Invitations", "Calendars"])
  })

  it("counts each group", () => {
    const counts = filterCounts()
    expect(counts.all).toBe(templates.length)
    for (const c of templateCategories) expect(counts[c.id]).toBe(templates.filter((t) => t.category === c.id).length)
  })

  it("counts an empty group as zero", () => {
    const onlyLetters = templates.filter((t) => t.category === "letter") as TemplateMeta[]
    expect(filterCounts(onlyLetters)).toMatchObject({ all: onlyLetters.length, gift: 0, calendar: 0 })
    expect(templatesFor("gift", onlyLetters)).toEqual([])
  })

  it("says how many are shown, in words", () => {
    expect(countLabel("all", 11)).toBe("11 templates")
    expect(countLabel("gift", 3)).toBe("3 gift templates")
    expect(countLabel("calendar", 1)).toBe("1 calendar template")
    expect(countLabel("invitation", 0)).toBe("No invitation templates yet")
  })
})
