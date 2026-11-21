// The store's own checks, with both Supabase clients replaced by fakes: demo
// slugs, slug validation before any lookup, content validation before any
// write, and that a new letter's slug and owner come from the server.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { createLetter, getPublicLetter, saveLetterContent } from "@/lib/letters/store"

const fakes = vi.hoisted(() => {
  // A chainable query: every builder method returns the query itself, and
  // awaiting it yields `result()`. Calls are recorded as [method, ...args].
  function query(result: () => unknown, calls: unknown[][]) {
    const proxy: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "then") return (resolve: (value: unknown) => void) => resolve(result())
          return (...args: unknown[]) => {
            calls.push([prop, ...args])
            return proxy
          }
        },
      },
    )
    return proxy
  }
  return { query, serverClient: vi.fn(), adminClient: vi.fn() }
})

vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/server", () => ({ createClient: fakes.serverClient }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fakes.adminClient }))

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const LETTER = "11111111-1111-4111-8111-111111111111"

beforeEach(() => {
  fakes.serverClient.mockReset().mockImplementation(() => {
    throw new Error("unexpected call to the user's client")
  })
  fakes.adminClient.mockReset().mockImplementation(() => {
    throw new Error("unexpected call to the admin client")
  })
})

describe("getPublicLetter", () => {
  it("serves the demo calendar from fixtures, started four days ago, with future doors locked", async () => {
    const view = await getPublicLetter("demo-calendar", new Date("2026-12-02T12:00:00Z"))
    expect(view?.kind).toBe("calendar")
    if (view?.kind !== "calendar") return
    expect(view.content.doors.filter((d) => !d.locked).map((d) => d.day)).toEqual([1, 2, 3, 4, 5])
    expect(JSON.stringify(view)).not.toContain(calendarFixtures["advent-classic"].doors[5].message)
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })

  it("returns null for a malformed slug without a lookup", async () => {
    expect(await getPublicLetter("../etc")).toBeNull()
    expect(await getPublicLetter("a b c d e f")).toBeNull()
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })

  it("looks up other slugs by exact match and never selects the chat", async () => {
    const calls: unknown[][] = []
    fakes.adminClient.mockReturnValue({ from: () => fakes.query(() => ({ data: null, error: null }), calls) })
    expect(await getPublicLetter("constructor")).toBeNull()
    expect(calls).toContainEqual(["eq", "slug", "constructor"])
    const select = calls.find((c) => c[0] === "select")
    expect(String(select?.[1])).not.toContain("chat")
  })
})

describe("saveLetterContent", () => {
  it("rejects a template of the other kind before writing", async () => {
    await expect(
      saveLetterContent(LETTER, {
        kind: "letter",
        templateId: "advent-classic",
        title: "x",
        content: letterFixtures["classic-envelope"],
      }),
    ).rejects.toThrow(/not a letter template/)
    expect(fakes.serverClient).not.toHaveBeenCalled()
  })

  it("rejects content that does not match the schema before writing", async () => {
    await expect(
      saveLetterContent(LETTER, {
        kind: "calendar",
        templateId: "advent-classic",
        title: "x",
        content: letterFixtures["classic-envelope"],
      }),
    ).rejects.toThrow(/calendar content is not valid/)
    expect(fakes.serverClient).not.toHaveBeenCalled()
  })

  it("writes validated content through the user's client", async () => {
    const calls: unknown[][] = []
    fakes.serverClient.mockResolvedValue({ from: () => fakes.query(() => ({ data: { id: LETTER }, error: null }), calls) })
    await saveLetterContent(LETTER, {
      kind: "letter",
      templateId: "classic-envelope",
      title: "  For Anna  ",
      content: letterFixtures["classic-envelope"],
    })
    expect(calls).toContainEqual([
      "update",
      { kind: "letter", template_id: "classic-envelope", title: "For Anna", content: letterFixtures["classic-envelope"] },
    ])
    expect(calls).toContainEqual(["eq", "id", LETTER])
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })
})

describe("createLetter", () => {
  it("inserts with the session's user and a 10-character slug", async () => {
    const inserted: Record<string, unknown>[] = []
    fakes.serverClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
      from: () => fakes.query(() => ({ count: 0, error: null }), []),
    })
    fakes.adminClient.mockReturnValue({
      from: () => {
        const calls: unknown[][] = []
        return fakes.query(() => {
          const row = calls.find((c) => c[0] === "insert")?.[1] as Record<string, unknown>
          inserted.push(row)
          return { data: { id: LETTER, slug: row.slug }, error: null }
        }, calls)
      },
    })

    const created = await createLetter()
    expect(created.id).toBe(LETTER)
    expect(created.slug).toMatch(/^[346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz]{10}$/)
    expect(inserted).toEqual([{ owner_id: USER, slug: created.slug }])
  })

  it("refuses when the daily limit is reached", async () => {
    fakes.serverClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: USER } }, error: null }) },
      from: () => fakes.query(() => ({ count: 5, error: null }), []),
    })
    await expect(createLetter()).rejects.toThrow(/5 gifts today/)
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })

  it("refuses without a session", async () => {
    fakes.serverClient.mockResolvedValue({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } })
    await expect(createLetter()).rejects.toThrow(/Not signed in/)
  })
})
