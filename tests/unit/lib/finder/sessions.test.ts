import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const calls: { table: string; method: string; args: unknown[] }[] = []
let result: { data: unknown; error: unknown } = { data: null, error: null }
function recorder(table: string) {
  const builder: Record<string, unknown> = {}
  for (const method of ["insert", "update", "select", "eq", "is", "single", "maybeSingle"]) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ table, method, args })
      return builder
    }
  }
  builder.then = (resolve: (value: unknown) => void) => resolve(result)
  return builder
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: recorder }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: recorder }) }))

import { getMyFinderSession, parseContext, parseOptions, saveFinderSession } from "@/lib/finder/sessions"

beforeEach(() => {
  calls.length = 0
  result = { data: null, error: null }
})

describe("reading a stored session back", () => {
  it("keeps the context fields it knows and drops broken ones", () => {
    expect(parseContext({ country: "DE", language: "de", ageRange: [45, 70], interests: ["Garten"], extra: "x" })).toEqual({
      country: "DE",
      language: "de",
      ageRange: [45, 70],
      interests: ["Garten"],
    })
    expect(parseContext({ ageRange: "old", language: 7 })).toEqual({ language: "en" })
    // The occasion is kept for the wrap step (issue #59).
    expect(parseContext({ language: "de", occasion: "Geburtstag" })).toEqual({ language: "de", occasion: "Geburtstag" })
    expect(parseContext({ language: "de", occasion: 30 })).toEqual({ language: "de" })
    expect(parseContext(null)).toEqual({ language: "en" })
  })

  it("reads options only when they are whole", () => {
    const option = { id: "o1", title: "T", description: "D", reason: "R", url: "https://shop.example/t" }
    expect(parseOptions({ options: [option], recommendedId: "o1", why: "W" })).toEqual({ options: [option], recommendedId: "o1", why: "W" })
    expect(parseOptions({ options: [{ id: "o1" }], recommendedId: "o1", why: "" })).toBeNull()
    expect(parseOptions(null)).toBeNull()
  })

  it("keeps the catalogue's marker with options from the instant answer, and drops a broken one (issue #97)", () => {
    const option = { id: "cat-a", title: "T", description: "D", reason: "R", url: "https://shop.example/t" }
    const marker = { message: "für meine Mama", group: "mother" }
    expect(parseOptions({ options: [option], recommendedId: "cat-a", why: "W", catalogue: marker })).toEqual({
      options: [option],
      recommendedId: "cat-a",
      why: "W",
      catalogue: marker,
    })
    expect(parseOptions({ options: [option], recommendedId: "cat-a", why: "W", catalogue: { message: "x", group: "aunt" } })).toEqual({
      options: [option],
      recommendedId: "cat-a",
      why: "W",
    })
  })

  it("does not query for an id that is not a uuid", async () => {
    expect(await getMyFinderSession("../etc")).toBeNull()
    expect(calls).toHaveLength(0)
  })
})

describe("saving a turn", () => {
  it("writes only the session's own row, matched by id and owner", async () => {
    result = { data: { id: "s1" }, error: null }
    await saveFinderSession({ id: "s1", ownerId: "user-1" }, { chat: [], context: { language: "de" }, lastOptions: null })
    // Read, then written: both matched by id and owner.
    expect(calls.filter((c) => c.method === "eq").map((c) => c.args)).toEqual([
      ["id", "s1"],
      ["owner_id", "user-1"],
      ["id", "s1"],
      ["owner_id", "user-1"],
    ])
    expect(calls.find((c) => c.method === "update")?.args[0]).toEqual({ chat: [], context: { language: "de", rev: 1 }, last_options: null })
  })

  it("throws when the row is not there", async () => {
    result = { data: null, error: null }
    await expect(saveFinderSession({ id: "s1", ownerId: "user-1" }, { chat: [], context: { language: "de" }, lastOptions: null })).rejects.toThrow(
      "Finder session not found",
    )
  })
})
