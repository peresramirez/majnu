// The name rules shared by gift pages, titles, previews and titleFor()
// (issue #62). components/letters/names.ts re-exports them.
import { describe, expect, it } from "vitest"
import { firstName, shortName, wholeName } from "@/lib/letters/names"

describe("firstName", () => {
  it("keeps only the first name", () => {
    expect(firstName("Anna Schmidt")).toBe("Anna")
    expect(firstName("  Lena ")).toBe("Lena")
    expect(firstName("Tom,")).toBe("Tom")
  })
  it("falls back when there is no name", () => {
    expect(firstName("")).toBe("you")
    expect(firstName(null)).toBe("you")
  })
})

describe("wholeName (issue #62)", () => {
  it("keeps the name as the sender gave it, groups included", () => {
    expect(wholeName("Anna")).toBe("Anna")
    expect(wholeName("our friends")).toBe("our friends")
    expect(wholeName("Mia & Leo")).toBe("Mia & Leo")
    expect(wholeName("  Lea   and Max. ")).toBe("Lea and Max")
  })
  it("falls back when there is no name", () => {
    expect(wholeName("")).toBe("you")
    expect(wholeName(null)).toBe("you")
    expect(wholeName("  ", "the host")).toBe("the host")
  })
  it("cuts a very long name at a word, with an ellipsis", () => {
    const name = wholeName("our dear friends from the climbing club on Thursdays")
    expect(name).toBe("our dear friends from the climbing club…")
    expect(Array.from(name).length).toBeLessThanOrEqual(41)
  })
})

describe("shortName (titles and previews)", () => {
  it("keeps one person to the first name, so no surname reaches a preview", () => {
    expect(shortName("Anna Schmidt")).toBe("Anna")
    expect(shortName("Anna")).toBe("Anna")
    expect(shortName("Everyone")).toBe("Everyone")
    expect(shortName("")).toBe("you")
  })
  it("keeps a group whole", () => {
    expect(shortName("our friends")).toBe("our friends")
    expect(shortName("Mia & Leo")).toBe("Mia & Leo")
    expect(shortName("the Smiths")).toBe("the Smiths")
  })
})
