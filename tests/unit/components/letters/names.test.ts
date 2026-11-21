import { describe, expect, it } from "vitest"
import { firstName, letterDescription, letterNoun, letterTitle, monogram, signOffLines } from "@/components/letters/names"
import { letterFixtures } from "@/lib/letters/fixtures"

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

describe("letterNoun", () => {
  it("names the kind of gift, and treats anything unknown as a letter", () => {
    expect(letterNoun("gift-reveal")).toBe("A gift")
    expect(letterNoun("advent-classic")).toBe("An advent calendar")
    expect(letterNoun("gift-box-3d")).toBe("A gift")
    expect(letterNoun("party-box")).toBe("A gift")
    expect(letterNoun("treasure-map")).toBe("A letter")
    expect(letterNoun("not-a-template")).toBe("A letter")
    expect(letterNoun(null)).toBe("A letter")
  })
})

describe("letterTitle", () => {
  it("names the kind of gift and the recipient's first name only", () => {
    expect(letterTitle("classic-envelope", "Anna")).toBe("A letter for Anna")
    expect(letterTitle("gift-reveal", "Tom")).toBe("A gift for Tom")
    expect(letterTitle("wedding-invite", "Sophie Meyer")).toBe("An invitation for Sophie")
    expect(letterTitle("party-invite", "Everyone")).toBe("An invitation for Everyone")
    expect(letterTitle("postcard", "Grandma")).toBe("A postcard for Grandma")
    expect(letterTitle("advent-classic", "Lena")).toBe("An advent calendar for Lena")
    expect(letterTitle("countdown", "Sam")).toBe("A countdown for Sam")
  })

  it("never contains the message or a gift code", () => {
    for (const [id, content] of Object.entries(letterFixtures)) {
      const text = `${letterTitle(id, content.recipientName)} ${letterDescription(content.recipientName)}`
      expect(text).not.toContain(content.headline)
      for (const p of content.body) expect(text).not.toContain(p)
      for (const g of content.gifts) {
        if (g.code) expect(text).not.toContain(g.code)
        expect(text).not.toContain(g.title)
      }
    }
  })
})

describe("monogram", () => {
  it("joins two names with an ampersand", () => {
    expect(monogram("Clara and Ben")).toBe("C & B")
    expect(monogram("lea & max")).toBe("L & M")
  })
  it("uses one initial for one name", () => {
    expect(monogram("Mia")).toBe("M")
    expect(monogram("")).toBe("M")
  })
})

describe("signOffLines", () => {
  it("adds a comma and the sender's name", () => {
    expect(signOffLines("With all my love", "Javier")).toEqual({ line: "With all my love,", name: "Javier" })
  })
  it("does not repeat a name the sign-off already has", () => {
    expect(signOffLines("Love, Lea and Max", "Lea and Max")).toEqual({ line: "Love, Lea and Max", name: null })
    expect(signOffLines("Clara and Ben", "Clara and Ben")).toEqual({ line: "Clara and Ben", name: null })
  })
  it("keeps existing punctuation", () => {
    expect(signOffLines("See you there.", "Mia")).toEqual({ line: "See you there.", name: "Mia" })
  })
})
