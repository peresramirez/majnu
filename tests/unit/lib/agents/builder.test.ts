import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/client", () => ({ getClient: vi.fn(), agentRequestBase: () => ({}), AGENT_EFFORT: "low" }))

import {
  BUILDER_SYSTEM_PROMPT,
  BuilderLetterContent,
  EVENT_TEMPLATES,
  GIFT_TEMPLATES,
  checkContent,
  contentForBuilder,
  sanitize,
  titleFor,
} from "@/lib/agents/builder"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import type { LetterContent } from "@/lib/letters/schema"

function withoutEvent(content: LetterContent): LetterContent {
  const { event, ...rest } = content
  void event
  return rest
}

describe("checkContent", () => {
  it("accepts every fixture for its own template", () => {
    for (const [id, content] of Object.entries(letterFixtures)) {
      expect(checkContent(id as keyof typeof letterFixtures, { kind: "letter", content })).toEqual([])
    }
    for (const [id, content] of Object.entries(calendarFixtures)) {
      expect(checkContent(id as keyof typeof calendarFixtures, { kind: "calendar", content })).toEqual([])
    }
  })

  it("needs exactly 24 doors in an advent calendar", () => {
    const content = { ...calendarFixtures["advent-classic"], doors: calendarFixtures["advent-classic"].doors.slice(0, 23) }
    expect(checkContent("advent-classic", { kind: "calendar", content })).toEqual(["the advent calendar needs exactly 24 doors, not 23"])
  })

  it("needs 1 to 31 doors in a countdown and a real start date", () => {
    const content = { ...calendarFixtures.countdown, doors: [], startDate: "2026-02-30" }
    expect(checkContent("countdown", { kind: "calendar", content })).toHaveLength(2)
  })

  it("needs an event on invitations and a gift on a gift reveal", () => {
    const { event, ...noEvent } = letterFixtures["party-invite"]
    void event
    expect(checkContent("party-invite", { kind: "letter", content: noEvent })).toHaveLength(1)
    expect(checkContent("gift-reveal", { kind: "letter", content: { ...letterFixtures["gift-reveal"], gifts: [] } })).toHaveLength(1)
  })

  it("needs a gift in a 3D gift box", () => {
    const content = { ...letterFixtures["gift-box-3d"], gifts: [] }
    expect(checkContent("gift-box-3d", { kind: "letter", content })).toEqual(["a 3D gift box needs at least one gift"])
    // Given as a gift or not, the box opens on its gift card.
    expect(checkContent("gift-box-3d", { kind: "letter", content }, { giftRequired: true })).toEqual(["a 3D gift box needs at least one gift"])
  })

  it("needs a gift in a party box only when it is given as a gift", () => {
    const content = { ...letterFixtures["party-box"], gifts: [] }
    expect(checkContent("party-box", { kind: "letter", content })).toEqual([])
    expect(checkContent("party-box", { kind: "letter", content }, { giftRequired: true })).toEqual([
      "this page is given as a gift, so it needs the gift from the brief",
    ])
    expect(checkContent("party-box", { kind: "letter", content: letterFixtures["party-box"] }, { giftRequired: true })).toEqual([])
  })

  it("never needs an event on a party box, which is an invitation only when it has one", () => {
    expect(checkContent("party-box", { kind: "letter", content: withoutEvent(letterFixtures["party-box"]) })).toEqual([])
  })

  it("needs the event on the 3D wedding envelope", () => {
    expect(checkContent("wedding-envelope-3d", { kind: "letter", content: withoutEvent(letterFixtures["wedding-envelope-3d"]) })).toEqual([
      "an invitation needs the event (title, startsAt, locationName, address)",
    ])
  })

  it("names every template that needs an event or a gift in the builder prompt", () => {
    expect(EVENT_TEMPLATES).toEqual(["wedding-invite", "party-invite", "wedding-envelope-3d"])
    expect(GIFT_TEMPLATES).toEqual(["gift-reveal", "gift-box-3d"])
    expect(BUILDER_SYSTEM_PROMPT).toContain(`Invitations (${EVENT_TEMPLATES.join(", ")})`)
    expect(BUILDER_SYSTEM_PROMPT).toContain(`(${GIFT_TEMPLATES.join(", ")}) needs at least one gift`)
    expect(BUILDER_SYSTEM_PROMPT).toContain("A party pop box (party-box) needs one when the brief gives a gift.")
  })
})

describe("sanitize", () => {
  it("drops links that are not https", () => {
    const content = {
      ...letterFixtures["gift-reveal"],
      gifts: [{ title: "Spa", url: "javascript:alert(1)", imageUrl: "http://example.com/a.png", code: "ABC" }],
    }
    const result = sanitize({ kind: "letter", content }, "Europe/Berlin")
    expect(result.kind === "letter" && result.content.gifts[0]).toEqual({ title: "Spa", code: "ABC" })
  })

  it("numbers doors by position and replaces an unknown timezone", () => {
    const base = calendarFixtures.countdown
    const content = { ...base, timezone: "Mars/Olympus", doors: base.doors.map((d) => ({ ...d, day: 99 })) }
    const result = sanitize({ kind: "calendar", content }, "Europe/Berlin")
    if (result.kind !== "calendar") throw new Error("expected a calendar")
    expect(result.content.timezone).toBe("Europe/Berlin")
    expect(result.content.doors.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe("titleFor", () => {
  it("is generic: the kind and the first name, never the message", () => {
    expect(titleFor("classic-envelope", "Anna")).toBe("A letter for Anna")
    expect(titleFor("gift-reveal", "Tom")).toBe("A gift for Tom")
    expect(titleFor("wedding-invite", "Sophie")).toBe("An invitation for Sophie")
    expect(titleFor("advent-classic", "  Lena ")).toBe("An advent calendar for Lena")
  })

  it("calls the two gift boxes a gift and the 3D wedding envelope an invitation", () => {
    expect(titleFor("gift-box-3d", "Mara")).toBe("A gift for Mara")
    expect(titleFor("party-box", "Jonas")).toBe("A gift for Jonas")
    expect(titleFor("wedding-envelope-3d", "Everyone")).toBe("An invitation for Everyone")
    expect(titleFor("treasure-map", "Ana")).toBe("A letter for Ana")
  })
})

describe("BUILDER_SYSTEM_PROMPT", () => {
  it("has no per-request facts in it, so it stays the same on every request", () => {
    expect(BUILDER_SYSTEM_PROMPT).not.toContain(new Date().toISOString().slice(0, 10))
    expect(BUILDER_SYSTEM_PROMPT).not.toMatch(/today is/i)
  })
})

describe("the gift list and the builder", () => {
  it("is not part of the builder's output schema, so it can never invent or drop gifts", () => {
    expect(Object.keys(BuilderLetterContent.shape)).not.toContain("wishlist")
    expect(Object.keys(BuilderLetterContent.shape)).toContain("event")
  })

  it("is left out of the current content the builder sees when editing", () => {
    const shown = contentForBuilder(letterFixtures["party-invite"])
    expect(shown).not.toHaveProperty("wishlist")
    expect(shown).toMatchObject({ headline: letterFixtures["party-invite"].headline })
    expect(contentForBuilder(calendarFixtures.countdown)).toBe(calendarFixtures.countdown)
  })
})
