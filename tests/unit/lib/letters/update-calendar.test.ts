// updateMyCalendar (issue #48): a calendar's content is changed on the
// content as stored now, and the write lands only if nobody changed the row
// since it was read, so a door saved while Majnu wrote notes is never lost.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { initialContent, setDoor } from "@/lib/calendars/doors"
import type { CalendarContent } from "@/lib/letters/schema"

vi.mock("server-only", () => ({}))

// A fake letters table behind the user's client: select by id, and an update
// that matches only while updated_at is unchanged (as the trigger guarantees).
type Row = { id: string; slug: string; kind: string; template_id: string; content: unknown; updated_at: string }
let row: Row | null
let tick = 0
let beforeWrite: (() => void) | null = null
const writes: unknown[] = []

function letters() {
  const filters: Record<string, unknown> = {}
  let update: Record<string, unknown> | null = null
  const q = {
    select: () => q,
    update(values: Record<string, unknown>) {
      update = values
      return q
    },
    eq(column: string, value: unknown) {
      filters[column] = value
      return q
    },
    maybeSingle: () => q,
    then(resolve: (value: unknown) => void) {
      const matches = row && Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v)
      if (!update) return resolve({ data: matches ? structuredClone(row) : null, error: null })
      if (beforeWrite) {
        const change = beforeWrite
        beforeWrite = null
        change()
      }
      const stillMatches = row && Object.entries(filters).every(([k, v]) => (row as Record<string, unknown>)[k] === v)
      if (!stillMatches || !row) return resolve({ data: null, error: null })
      writes.push(update.content)
      row = { ...row, ...update, updated_at: `t${++tick}` }
      return resolve({ data: { id: row.id }, error: null })
    },
  }
  return q
}

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => letters() }) }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }))

import { updateMyCalendar } from "@/lib/letters/store"

const ID = "11111111-1111-4111-8111-111111111111"
const base = () => initialContent({ templateId: "advent-classic", recipientName: "Anna", senderName: "Javier", startDate: "2026-12-01", timezone: "Europe/Berlin" })

beforeEach(() => {
  tick = 0
  writes.length = 0
  beforeWrite = null
  row = { id: ID, slug: "Cal3nd4rAB", kind: "calendar", template_id: "advent-classic", content: base(), updated_at: "t0" }
})

describe("updateMyCalendar", () => {
  it("applies the change to the stored content and saves it", async () => {
    const saved = await updateMyCalendar(ID, (current) => setDoor(current, 1, { title: "", message: "Hallo" }))
    expect(saved.content.doors[0].message).toBe("Hallo")
    expect(saved.templateId).toBe("advent-classic")
    expect((row!.content as CalendarContent).doors[0].message).toBe("Hallo")
  })

  it("starts again on the fresh content when the row changed in between, keeping both changes", async () => {
    beforeWrite = () => {
      // The sender saved door 2 while this change (door 1) was on its way.
      row = { ...row!, content: setDoor(row!.content as CalendarContent, 2, { title: "", message: "Door two" }), updated_at: "other" }
    }
    let calls = 0
    const saved = await updateMyCalendar(ID, (current) => {
      calls++
      return setDoor(current, 1, { title: "", message: "Door one" })
    })
    expect(calls).toBe(2)
    expect(saved.content.doors[0].message).toBe("Door one")
    expect(saved.content.doors[1].message).toBe("Door two")
  })

  it("refuses letters that are not the user's calendar, and content that does not validate", async () => {
    await expect(updateMyCalendar("not-a-uuid", (c) => c)).rejects.toThrow("Letter not found")
    row = { ...row!, kind: "letter" }
    await expect(updateMyCalendar(ID, (c) => c)).rejects.toThrow("Letter not found")
    row = { ...row!, kind: "calendar" }
    await expect(updateMyCalendar(ID, (c) => ({ ...c, startDate: 5 as unknown as string }))).rejects.toThrow(/not valid/)
    expect(writes).toHaveLength(0)
  })

  it("writes nothing when the change returns null", async () => {
    const saved = await updateMyCalendar(ID, () => null)
    expect(saved.content.doors).toHaveLength(24)
    expect(writes).toHaveLength(0)
  })
})
