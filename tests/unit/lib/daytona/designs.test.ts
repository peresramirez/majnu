import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const fakes = vi.hoisted(() => ({ createAdminClient: vi.fn() }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fakes.createAdminClient }))

import { designCsp, designHeaders, getLatestDesign, getLatestDesignInfo, threeSources } from "@/lib/daytona/designs"

const LETTER_ID = "6e004a41-de61-4a68-addf-7aef8469fc9e"

// Records the query each table receives and answers with the given rows.
function fakeAdmin(letter: { id: string } | null, design: Record<string, string> | null) {
  const queries: Record<string, unknown[][]> = {}
  const builder = (table: string, result: unknown) => {
    const log = (queries[table] ??= [])
    const chain = {
      select: (...args: unknown[]) => (log.push(["select", ...args]), chain),
      eq: (...args: unknown[]) => (log.push(["eq", ...args]), chain),
      order: (...args: unknown[]) => (log.push(["order", ...args]), chain),
      limit: (...args: unknown[]) => (log.push(["limit", ...args]), chain),
      maybeSingle: async () => ({ data: result, error: null }),
    }
    return chain
  }
  const admin = { from: (table: string) => builder(table, table === "letters" ? letter : design) }
  fakes.createAdminClient.mockReturnValue(admin)
  return queries
}

beforeEach(() => {
  fakes.createAdminClient.mockReset()
})

describe("the design response headers", () => {
  const THREE = "/vendor/three/0.187.0/three.module.min.js"

  it("sandbox the page, allow no requests but our three.js and keep it out of search engines", () => {
    const csp = designCsp("https://majnu.app")
    expect(csp).toBe(
      "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox; default-src 'none'; style-src 'unsafe-inline'; " +
        `script-src 'unsafe-inline' https://majnu.app${THREE}; img-src data:; font-src data:; base-uri 'none'; form-action 'none'`,
    )
    // Not allowed: the page sharing our origin, navigating the letter page, or submitting forms.
    expect(csp).not.toMatch(/allow-same-origin|allow-top-navigation|allow-forms|allow-modals/)
    // No 'self', no host without a path, no folder: one exact file.
    expect(csp).not.toMatch(/'self'|https:\/\/majnu\.app[ ;]|\/vendor\/three\/[^ ;]*\/[ ;]|\*/)
    expect(designHeaders("https://majnu.app")).toEqual({
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": csp,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "private, no-store",
    })
  })

  it("names three.js on majnu.app and on the host the request came to", () => {
    expect(threeSources("http://localhost:3117")).toEqual([`https://majnu.app${THREE}`, `http://localhost:3117${THREE}`])
    expect(designCsp("https://preview.majnu.app")).toContain(`script-src 'unsafe-inline' https://majnu.app${THREE} https://preview.majnu.app${THREE};`)
    expect(threeSources()).toEqual([`https://majnu.app${THREE}`])
  })

  it("ignores an origin that is not a plain http(s) origin", () => {
    for (const origin of ["null", "https://x.example; script-src *", "javascript:alert(1)", "https://x.example/path", "https://*"]) {
      expect(threeSources(origin)).toEqual([`https://majnu.app${THREE}`])
    }
  })
})

describe("getLatestDesign", () => {
  it("finds the letter by exact slug and returns its newest design", async () => {
    const queries = fakeAdmin({ id: LETTER_ID }, { id: "d2", html: "<!doctype html>", created_at: "2026-11-21T20:00:00Z" })
    await expect(getLatestDesign("wJCg3TjW7x")).resolves.toEqual({ id: "d2", html: "<!doctype html>", createdAt: "2026-11-21T20:00:00Z" })
    expect(queries.letters).toEqual([
      ["select", "id"],
      ["eq", "slug", "wJCg3TjW7x"],
    ])
    expect(queries.letter_designs).toEqual([
      ["select", "id, html, created_at"],
      ["eq", "letter_id", LETTER_ID],
      ["order", "created_at", { ascending: false }],
      ["limit", 1],
    ])
  })

  it("returns null for an unknown slug without looking for designs", async () => {
    const queries = fakeAdmin(null, null)
    await expect(getLatestDesign("NoSuchLetter")).resolves.toBeNull()
    expect(queries.letter_designs).toBeUndefined()
  })

  it("returns null for a letter without a design", async () => {
    fakeAdmin({ id: LETTER_ID }, null)
    await expect(getLatestDesign("wJCg3TjW7x")).resolves.toBeNull()
  })

  it("does not query for slugs that cannot exist", async () => {
    const queries = fakeAdmin({ id: LETTER_ID }, null)
    await expect(getLatestDesign("a'; drop")).resolves.toBeNull()
    expect(queries.letters).toBeUndefined()
  })
})

describe("getLatestDesignInfo", () => {
  it("returns the newest design's id and date without the HTML", async () => {
    const queries = fakeAdmin({ id: LETTER_ID }, { id: "d2", created_at: "2026-11-21T20:00:00Z" })
    await expect(getLatestDesignInfo("wJCg3TjW7x")).resolves.toEqual({ id: "d2", createdAt: "2026-11-21T20:00:00Z" })
    expect(queries.letter_designs[0]).toEqual(["select", "id, created_at"])
  })
})
