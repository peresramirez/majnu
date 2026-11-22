// listMyOpenEvents reads with the owner's own session and asks only for the
// columns owners are granted (0009_open_details.sql): never the visitor hash
// or the user agent.
import { beforeEach, describe, expect, it, vi } from "vitest"

const fakes = vi.hoisted(() => ({ createClient: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: fakes.createClient }))

import { listMyOpenEvents, MAX_TRACKED_EVENTS, toTrackedEvent } from "@/lib/open/timeline"

const LETTER = "11111111-1111-4111-8111-111111111111"

function fakeClient(result: { data: unknown; error: unknown }) {
  const calls: { table?: string; columns?: string; order: unknown[]; limit?: number } = { order: [] }
  const query = {
    select(columns: string) {
      calls.columns = columns
      return query
    },
    order(...args: unknown[]) {
      calls.order.push(args)
      return query
    },
    limit(n: number) {
      calls.limit = n
      return query
    },
    returns: async () => result,
  }
  fakes.createClient.mockResolvedValue({
    from(table: string) {
      calls.table = table
      return query
    },
  })
  return calls
}

beforeEach(() => fakes.createClient.mockReset())

describe("listMyOpenEvents", () => {
  it("selects only the granted columns of letter_events, newest first, with a cap", async () => {
    const calls = fakeClient({
      data: [
        { id: 7, letter_id: LETTER, type: "door_open", day: 3, country: "DE", city: "Berlin", language: "de", device: "phone", created_at: "2026-11-22T08:00:00Z" },
        { id: 6, letter_id: LETTER, type: "open", day: 0, country: null, city: null, language: null, device: null, created_at: "2026-11-21T08:00:00Z" },
      ],
      error: null,
    })
    const events = await listMyOpenEvents()
    expect(calls.table).toBe("letter_events")
    expect(calls.columns?.split(", ").sort()).toEqual(["city", "country", "created_at", "day", "device", "id", "language", "letter_id", "type"])
    expect(calls.columns).not.toMatch(/visitor_id|user_agent|\*/)
    expect(calls.order[0]).toEqual(["created_at", { ascending: false }])
    expect(calls.limit).toBe(MAX_TRACKED_EVENTS)
    expect(events).toEqual([
      { id: 7, letterId: LETTER, type: "door_open", day: 3, country: "DE", city: "Berlin", language: "de", device: "phone", at: "2026-11-22T08:00:00Z" },
      { id: 6, letterId: LETTER, type: "open", day: 0, country: null, city: null, language: null, device: null, at: "2026-11-21T08:00:00Z" },
    ])
  })

  it("throws when the read fails, so the page shows its error state", async () => {
    fakeClient({ data: null, error: { message: "permission denied for table letter_events" } })
    await expect(listMyOpenEvents()).rejects.toThrow(/Could not load when your gifts were opened/)
  })

  it("drops rows with an unknown type and unknown devices", () => {
    const row = { id: 1, letter_id: LETTER, type: "open", day: 0, country: null, city: null, language: null, device: "watch", created_at: "2026-11-21T08:00:00Z" }
    expect(toTrackedEvent(row)?.device).toBeNull()
    expect(toTrackedEvent({ ...row, type: "view" })).toBeNull()
  })
})
