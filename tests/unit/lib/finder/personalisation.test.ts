// The personalisation score shown next to "Their profile so far" (issue #97).
import { describe, expect, it } from "vitest"
import { PERSONALISATION_WEIGHTS, countOwnAnswers, personalisationScore } from "@/lib/finder/personalisation"

describe("personalisationScore", () => {
  it("starts at 0 and offers the profile first, its biggest gain", () => {
    expect(personalisationScore({ context: null })).toEqual({
      score: 0,
      next: { key: "profile", label: "Add their Instagram, TikTok or LinkedIn", gain: 20 },
    })
    expect(personalisationScore({ context: { language: "de", country: "DE", currency: "EUR" } }).score).toBe(0)
  })

  it("weighs each thing Majnu knows", () => {
    const score = (context: Parameters<typeof personalisationScore>[0]["context"], extra = {}) => personalisationScore({ context, ...extra }).score
    expect(score({ language: "de", relationship: "Mama" })).toBe(10)
    expect(score({ language: "de", ageRange: [45, 70] })).toBe(8)
    expect(score({ language: "de", occasion: "Geburtstag" })).toBe(10)
    expect(score({ language: "de", budget: "unter 50 €" })).toBe(8)
    expect(score({ language: "de", name: "Ana" })).toBe(6)
    expect(score({ language: "de" }, { profilesRead: 1 })).toBe(20)
    expect(score({ language: "de", interests: ["Garten"] })).toBe(6)
    expect(score({ language: "de", interests: ["Garten", "garten", "Kochen", "Jazz", "Yoga"] })).toBe(18)
    expect(score({ language: "de", notes: ["Wishlist: Kindle", "Liebt Jazz", "Spielt Saxofon"] })).toBe(10)
    expect(score({ language: "de" }, { ownAnswers: 1 })).toBe(5)
    expect(score({ language: "de" }, { ownAnswers: 9 })).toBe(10)
    expect(score({ language: "de", relationship: " " })).toBe(0)
  })

  it("adds up to exactly 100 when Majnu knows everything, with nothing left to suggest", () => {
    const w = PERSONALISATION_WEIGHTS
    expect(
      w.relationship + w.age + w.occasion + w.budget + w.interestEach * w.interestMax + w.name + w.profile + w.noteEach * w.noteMax + w.ownWordsEach * w.ownWordsMax,
    ).toBe(100)
    const full = personalisationScore({
      context: {
        language: "de",
        relationship: "Mama",
        ageRange: [60, 60],
        occasion: "Geburtstag",
        budget: "50 €",
        interests: ["Garten", "Kochen", "Jazz"],
        name: "Ana",
        notes: ["a", "b"],
      },
      profilesRead: 2,
      ownAnswers: 2,
    })
    expect(full).toEqual({ score: 100, next: null })
  })

  it("suggests the next best addition", () => {
    const withProfile = personalisationScore({ context: { language: "de", relationship: "Mama" }, profilesRead: 1 })
    expect(withProfile).toEqual({ score: 30, next: { key: "occasion", label: "Name the occasion", gain: 10 } })
    const almost = personalisationScore({
      context: { language: "de", relationship: "Mama", occasion: "x", ageRange: [1, 2], budget: "x", interests: ["a", "b", "c"], notes: ["a", "b"] },
      profilesRead: 1,
      ownAnswers: 2,
    })
    expect(almost).toEqual({ score: 94, next: { key: "name", label: "Tell Majnu their name", gain: 6 } })
  })
})

describe("countOwnAnswers", () => {
  it("counts the Other answers the finder sends", () => {
    expect(countOwnAnswers(["Free time: other: restores old motorbikes. Occasion: Birthday."])).toBe(1)
    expect(countOwnAnswers(["Free time: other: chess.", "Occasion: other: her retirement. Budget: other: 80 €."])).toBe(3)
    expect(countOwnAnswers(["She has no other hobbies", "Personalise the gift", "other:"])).toBe(0)
  })
})
