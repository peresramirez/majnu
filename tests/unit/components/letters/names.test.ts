import { describe, expect, it } from "vitest"
import {
  isGroup,
  letterDescription,
  letterNoun,
  letterTitle,
  monogram,
  possessive,
  sentenceStart,
  signOffLines,
  verbFor,
} from "@/components/letters/names"
import { letterFixtures } from "@/lib/letters/fixtures"

describe("isGroup and verbFor (issue #62)", () => {
  it.each(["Mia & Leo", "Mia&Leo", "Lea and Max", "Mama und Papa", "Ana y Luis", "our friends", "Friends", "my dear friends", "Liebe Freunde", "the Schmidts", "dear neighbours", "our kids", "you all"])(
    "reads %s as more than one person",
    (name) => {
      expect(isGroup(name)).toBe(true)
      expect(verbFor(name, "sees", "see")).toBe("see")
    },
  )

  it.each(["Anna", "Anna Schmidt", "Everyone", "Grandma", "my boss", "our Lucas", "my love", "Thomas", ""])("reads %j as one person", (name) => {
    expect(isGroup(name)).toBe(false)
    expect(verbFor(name, "sees", "see")).toBe("sees")
  })

  it("agrees with you", () => {
    expect(verbFor("you", "hears", "hear")).toBe("hear")
  })
})

describe("possessive and sentenceStart", () => {
  it("adds 's, or only ' to a group ending in s", () => {
    expect(possessive("Anna")).toBe("Anna's")
    expect(possessive("Lea and Max")).toBe("Lea and Max's")
    expect(possessive("the Schmidts")).toBe("the Schmidts'")
    expect(possessive("James")).toBe("James's")
  })
  it("starts a sentence with a capital", () => {
    expect(sentenceStart("our friends")).toBe("Our friends")
    expect(sentenceStart("Anna")).toBe("Anna")
    expect(sentenceStart("")).toBe("")
  })
})

describe("letterNoun", () => {
  it("names the kind of gift, and treats anything unknown as a letter", () => {
    expect(letterNoun("gift-reveal")).toBe("A gift")
    expect(letterNoun("advent-classic")).toBe("An advent calendar")
    expect(letterNoun("gift-box-3d")).toBe("A gift")
    expect(letterNoun("party-box")).toBe("A gift")
    expect(letterNoun("treasure-map")).toBe("A letter")
    expect(letterNoun("wedding-envelope-3d")).toBe("An invitation")
    expect(letterNoun("not-a-template")).toBe("A letter")
    expect(letterNoun(null)).toBe("A letter")
  })
})

describe("letterTitle", () => {
  it("names the kind of gift and one recipient by the first name only", () => {
    expect(letterTitle("classic-envelope", "Anna")).toBe("A letter for Anna")
    expect(letterTitle("gift-reveal", "Tom")).toBe("A gift for Tom")
    expect(letterTitle("wedding-invite", "Sophie Meyer")).toBe("An invitation for Sophie")
    expect(letterDescription("Anna Schmidt")).toBe("Made for Anna with Majnu.")
  })

  it("names a group whole (issue #62)", () => {
    expect(letterTitle("party-invite", "our friends")).toBe("An invitation for our friends")
    expect(letterTitle("classic-envelope", "the Smiths")).toBe("A letter for the Smiths")
    expect(letterDescription("Mia & Leo")).toBe("Made for Mia & Leo with Majnu.")
  })

  it("names the other kinds", () => {
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
