import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("no database in this test") } }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => { throw new Error("no database in this test") } }))

import { daysBefore, getPublicLetter } from "@/lib/letters/store"

describe("daysBefore", () => {
  it("counts back calendar days in the given timezone", () => {
    // 23:30 UTC on 21 Nov is already 22 Nov in Berlin.
    expect(daysBefore(new Date("2026-11-21T23:30:00Z"), 4, "Europe/Berlin")).toBe("2026-11-18")
    expect(daysBefore(new Date("2026-03-02T12:00:00Z"), 4, "Europe/Berlin")).toBe("2026-02-26")
  })
})

describe("demo calendar", () => {
  it("has doors 1 to 5 open and the rest locked on any day", async () => {
    for (const when of ["2026-11-21T10:00:00Z", "2027-06-30T22:30:00Z"]) {
      const letter = await getPublicLetter("demo-calendar", new Date(when))
      if (letter?.kind !== "calendar") throw new Error("expected a calendar")
      const open = letter.content.doors.filter((d) => !d.locked).map((d) => d.day)
      expect(open).toEqual([1, 2, 3, 4, 5])
      expect(JSON.stringify(letter.content.doors.filter((d) => d.locked))).not.toContain("message")
    }
  })
})
