import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/builder", () => ({ buildContent: vi.fn() }))

import { buildContent } from "@/lib/agents/builder"
import { initialContent, setDoor } from "@/lib/calendars/doors"
import { notesBrief, writeNotes } from "@/lib/calendars/notes"

function content() {
  let c = initialContent({ templateId: "advent-classic", recipientName: "Anna", senderName: "Javier", startDate: "2026-12-01", timezone: "Europe/Berlin" })
  c = setDoor(c, 1, { gift: { title: "Lavendel-Badesalz", description: "Ein Badesalz.", url: "https://seife.example/bad", price: "8,90 €", code: "SECRET" }, title: "", message: "" })!
  c = setDoor(c, 2, { title: "Unser Tag", message: "Weißt du noch, der Strand?" })!
  return c
}

describe("notesBrief", () => {
  const brief = notesBrief({
    content: content(),
    templateId: "advent-classic",
    marker: { kind: "partner", about: "Sie friert immer.", relationship: "meine Freundin", interests: ["Yoga", "Tee"] },
    language: "de",
  })

  it("names the language, the people and the number of doors", () => {
    expect(brief).toContain("24-door advent calendar")
    expect(brief).toContain("Write everything in German (de).")
    expect(brief).toContain("Recipient's name: Anna. Who they are to the sender: meine Freundin.")
    expect(brief).toContain("They love: Yoga, Tee.")
    expect(brief).toContain("Return exactly 24 doors")
    expect(brief).toContain("<about>\nSie friert immer.\n</about>")
  })

  it("lists each door's gift, copies the sender's own notes, and never sends a price, link or code", () => {
    expect(brief).toContain("1 (2026-12-01): gift: Lavendel-Badesalz (Ein Badesalz.)")
    expect(brief).toContain("2 (2026-12-02): the sender wrote this note; copy it unchanged. Title: Unser Tag. Note: Weißt du noch, der Strand?")
    expect(brief).toContain("3 (2026-12-03): no gift")
    expect(brief).not.toContain("SECRET")
    expect(brief).not.toContain("https://seife.example")
    expect(brief).not.toContain("8,90")
  })
})

describe("writeNotes", () => {
  it("is one builder call for the calendar's template and timezone", async () => {
    const built = { ...content(), headline: "24 Türchen" }
    vi.mocked(buildContent).mockResolvedValue({ kind: "calendar", content: built })
    const now = new Date("2026-11-22T10:00:00Z")
    expect(await writeNotes({ content: content(), templateId: "advent-classic", language: "de", now })).toBe(built)
    expect(buildContent).toHaveBeenCalledTimes(1)
    expect(buildContent).toHaveBeenCalledWith(expect.objectContaining({ mode: "build", templateId: "advent-classic", timezone: "Europe/Berlin", now }))
  })
})
