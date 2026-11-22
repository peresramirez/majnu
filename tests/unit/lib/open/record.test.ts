// recordOpenEvent with the admin client replaced by a fake: what gets written,
// and what is ignored.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { calendarFixtures } from "@/lib/letters/fixtures"
import { recordOpenEvent } from "@/lib/open/record"

const fakes = vi.hoisted(() => ({ adminClient: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fakes.adminClient }))

const LETTER_ID = "11111111-1111-4111-8111-111111111111"
const IP = "203.0.113.7"

const calendarRow = {
  id: LETTER_ID,
  owner_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  slug: "Kp7dRw3xYq",
  kind: "calendar",
  template_id: "advent-classic",
  title: "For Lena",
  content: calendarFixtures["advent-classic"],
  created_at: "2026-11-20T10:00:00Z",
  updated_at: "2026-11-20T10:00:00Z",
}

// A fake admin client: the letters lookup returns `row`; upserts are captured.
function fakeAdmin(row: unknown) {
  const upserts: { values: Record<string, unknown>; options: unknown }[] = []
  const client = {
    from(table: string) {
      if (table === "letters") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
        }
      }
      return {
        upsert: async (values: Record<string, unknown>, options: unknown) => {
          upserts.push({ values, options })
          return { error: null }
        },
      }
    },
  }
  fakes.adminClient.mockReturnValue(client)
  return upserts
}

beforeEach(() => {
  vi.stubEnv("OPEN_HASH_SECRET", "test-secret")
  fakes.adminClient.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

const event = { slug: calendarRow.slug, ip: IP, userAgent: "Mozilla/5.0 Test", now: new Date("2026-12-03T12:00:00Z") }

describe("recordOpenEvent", () => {
  it("writes an open as day 0 with a hashed visitor id and never the IP address", async () => {
    const upserts = fakeAdmin(calendarRow)
    await recordOpenEvent({ ...event, type: "open" })
    expect(upserts).toHaveLength(1)
    const { values, options } = upserts[0]
    expect(values).toMatchObject({ letter_id: LETTER_ID, type: "open", day: 0, user_agent: "Mozilla/5.0 Test" })
    expect(values.visitor_id).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(values)).not.toContain(IP)
    expect(options).toEqual({ onConflict: "letter_id,type,day,visitor_id", ignoreDuplicates: true })
  })

  it("writes the place, language and device it is given, and nulls without them", async () => {
    let upserts = fakeAdmin(calendarRow)
    await recordOpenEvent({
      ...event,
      type: "open",
      details: { country: "DE", city: "Berlin", language: "de", device: "phone" },
    })
    expect(upserts[0]?.values).toMatchObject({ country: "DE", city: "Berlin", language: "de", device: "phone" })
    expect(JSON.stringify(upserts[0]?.values)).not.toContain(IP)

    upserts = fakeAdmin(calendarRow)
    await recordOpenEvent({ ...event, type: "open" })
    expect(upserts[0]?.values).toMatchObject({ country: null, city: null, language: null, device: null })
  })

  it("ignores crawlers that ran the beacon, without a lookup", async () => {
    for (const userAgent of [
      "WhatsApp/2.24.23.78 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    ]) {
      await recordOpenEvent({ ...event, userAgent, type: "open" })
    }
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })

  it("writes a door open for a door that is open now", async () => {
    const upserts = fakeAdmin(calendarRow)
    await recordOpenEvent({ ...event, type: "door_open", day: 3 })
    expect(upserts[0]?.values).toMatchObject({ type: "door_open", day: 3 })
  })

  it("ignores events for locked doors", async () => {
    const upserts = fakeAdmin(calendarRow)
    await recordOpenEvent({ ...event, type: "door_open", day: 4 })
    await recordOpenEvent({ ...event, type: "gift_click", day: 6 })
    expect(upserts).toEqual([])
  })

  it("ignores unknown slugs and letters without content", async () => {
    let upserts = fakeAdmin(null)
    await recordOpenEvent({ ...event, type: "open" })
    expect(upserts).toEqual([])
    upserts = fakeAdmin({ ...calendarRow, content: null })
    await recordOpenEvent({ ...event, type: "open" })
    expect(upserts).toEqual([])
  })

  it("ignores demo and malformed slugs without a lookup", async () => {
    await recordOpenEvent({ ...event, slug: "demo-calendar", type: "open" })
    await recordOpenEvent({ ...event, slug: "x", type: "open" })
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })

  it("records nothing without OPEN_HASH_SECRET", async () => {
    vi.stubEnv("OPEN_HASH_SECRET", "")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    await recordOpenEvent({ ...event, type: "open" })
    expect(fakes.adminClient).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
