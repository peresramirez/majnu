import { describe, expect, it } from "vitest"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { toPublicView } from "@/lib/letters/public-view"
import type { LetterRecord, PublicLetter } from "@/lib/letters/schema"
import { trackedDay } from "@/lib/open/rules"

function view(overrides: Partial<LetterRecord>, now: string): PublicLetter {
  const v = toPublicView(
    {
      id: "00000000-0000-4000-8000-000000000001",
      ownerId: "owner",
      slug: "abcdefghij",
      kind: "calendar",
      templateId: "advent-classic",
      title: null,
      content: calendarFixtures["advent-classic"],
      createdAt: "2026-11-01T00:00:00Z",
      updatedAt: "2026-11-01T00:00:00Z",
      ...overrides,
    },
    new Date(now),
    { ownerPreview: false },
  )
  if (!v) throw new Error("expected a view")
  return v
}

// 3 December in Berlin: doors 1 to 3 are open.
const calendar = view({}, "2026-12-03T12:00:00Z")
const letter = view({ kind: "letter", templateId: "gift-reveal", content: letterFixtures["gift-reveal"] }, "2026-12-03T12:00:00Z")

describe("trackedDay", () => {
  it("stores every open as day 0", () => {
    expect(trackedDay(calendar, "open", undefined)).toBe(0)
    expect(trackedDay(calendar, "open", 5)).toBe(0)
    expect(trackedDay(letter, "open", undefined)).toBe(0)
  })

  it("records door opens only for doors that are open now", () => {
    expect(trackedDay(calendar, "door_open", 3)).toBe(3)
    expect(trackedDay(calendar, "door_open", 4)).toBeNull()
    expect(trackedDay(calendar, "door_open", 24)).toBeNull()
  })

  it("ignores door opens without a valid door", () => {
    expect(trackedDay(calendar, "door_open", undefined)).toBeNull()
    expect(trackedDay(calendar, "door_open", 0)).toBeNull()
    expect(trackedDay(calendar, "door_open", 30)).toBeNull()
    expect(trackedDay(letter, "door_open", 1)).toBeNull()
  })

  it("records gift clicks on letters as day 0 and on calendars by open door", () => {
    expect(trackedDay(letter, "gift_click", undefined)).toBe(0)
    expect(trackedDay(letter, "gift_click", 0)).toBe(0)
    expect(trackedDay(letter, "gift_click", 2)).toBeNull()
    expect(trackedDay(calendar, "gift_click", 2)).toBe(2)
    // Door 6 holds the gift but is still locked on 3 December.
    expect(trackedDay(calendar, "gift_click", 6)).toBeNull()
    expect(trackedDay(calendar, "gift_click", undefined)).toBeNull()
  })
})
