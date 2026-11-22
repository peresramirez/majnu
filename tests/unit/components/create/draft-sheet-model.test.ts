import { describe, expect, it } from "vitest"
import { changedSlot, eventWhen, slotsOf } from "@/components/create/draft-state"
import type { DraftView } from "@/components/create/draft-state"

const letter = (content: Extract<DraftView, { kind: "letter" }>["content"]): DraftView => ({
  kind: "letter",
  templateId: "classic-envelope",
  phase: "writing",
  content,
})

describe("the piece being written", () => {
  it("is the last piece, in reading order, that changed since the previous draft", () => {
    const before = new Map(slotsOf(letter({ headline: "Happy birthday", body: ["One."] })).map((s) => [s.key, s.text]))
    // Between two drafts the first paragraph finished and the second began.
    expect(changedSlot(before, slotsOf(letter({ headline: "Happy birthday", body: ["One. More.", "Tw"] })))).toBe("body.1")
  })

  it("is found in the middle of an edit, where the rest is already there", () => {
    const full = { headline: "Happy birthday", body: ["One.", "Two."], signOff: "Love", gifts: [{ title: "Spa" }] }
    const before = new Map(slotsOf(letter(full)).map((s) => [s.key, s.text]))
    expect(changedSlot(before, slotsOf(letter({ ...full, body: ["One, now longer", "Two."] })))).toBe("body.0")
    expect(changedSlot(before, slotsOf(letter(full)))).toBeNull()
  })
})

describe("eventWhen", () => {
  it("reads the date and time as written, in the event's own time", () => {
    const when = eventWhen("2026-12-24T19:00:00+01:00")
    expect(when).toContain("2026")
    expect(when).toMatch(/19:00$/)
  })

  it("waits for a whole date", () => {
    expect(eventWhen("2026-12-2")).toBeNull()
    expect(eventWhen("2026-02-30")).toBeNull()
    expect(eventWhen(undefined)).toBeNull()
    expect(eventWhen("2026-12-24T1")).not.toMatch(/:/)
  })
})
