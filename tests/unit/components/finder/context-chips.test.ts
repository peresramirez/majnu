import { describe, expect, it } from "vitest"
import { contextChips } from "@/components/finder/context-chips"

describe("contextChips", () => {
  it("shows nothing before Majnu has assumed anything", () => {
    expect(contextChips(null)).toEqual([])
  })

  it("names who it is for, the age, the country and the language", () => {
    const chips = contextChips({ relationship: "mother", ageRange: [45, 70], country: "DE", language: "de", region: "Berlin", currency: "EUR" })
    expect(chips.map((c) => c.label)).toEqual(["Your mother", "About 45–70", "Germany", "German"])
    // The region and currency are not shown.
    expect(chips.some((c) => c.label.includes("Berlin"))).toBe(false)
  })

  it("reads 'my best friend' and 'a colleague' naturally", () => {
    expect(contextChips({ language: "en", relationship: "my best friend" })[0].label).toBe("Your best friend")
    expect(contextChips({ language: "en", relationship: "a colleague" })[0].label).toBe("Your colleague")
  })

  it("gives each chip a correction to start and a description for screen readers", () => {
    const [age] = contextChips({ language: "en", ageRange: [70, 45] })
    expect(age.label).toBe("About 45–70")
    expect(age.description).toBe("About 45 to 70 years old. Change the age")
    expect(age.prefill).toBe("They're ")
    expect(contextChips({ language: "en", ageRange: [60, 60] })[0].label).toBe("About 60")
  })

  it("shows the budget and up to three interests", () => {
    const chips = contextChips({ language: "en", budget: "under 50 €", interests: ["fishing", "books", "jazz", "tea"] })
    expect(chips.map((c) => c.label)).toEqual(["Under 50 €", "Likes fishing, books, jazz", "English"])
  })

  it("falls back to the code for an unknown country or language", () => {
    const chips = contextChips({ language: "zz-invalid-", country: "QQ" })
    expect(chips.map((c) => c.label)).toEqual(["QQ", "zz-invalid-"])
  })

  it("shows the occasion after who it is for, so the visitor can correct it (issue #59)", () => {
    const chips = contextChips({ language: "en", relationship: "mother", occasion: "birthday", ageRange: [45, 70] })
    expect(chips.map((c) => c.label)).toEqual(["Your mother", "Birthday", "About 45–70", "English"])
    expect(chips[1]).toMatchObject({ key: "occasion", description: "Occasion: birthday. Change the occasion", prefill: "The occasion is " })
  })
})
