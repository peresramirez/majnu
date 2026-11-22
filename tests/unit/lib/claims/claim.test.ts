// claimGift and getClaimedItemIds against an in-memory gift_claims table that
// enforces the unique (letter_id, item_id) constraint like the migration does.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { claimGift, claimedIdsForPage, getClaimedItemIds } from "@/lib/claims/claim"
import { MAX_CLAIMS_PER_VISITOR } from "@/lib/claims/rules"
import { letterFixtures } from "@/lib/letters/fixtures"

const fakes = vi.hoisted(() => ({ adminClient: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fakes.adminClient }))

const LETTER_ID = "11111111-1111-4111-8111-111111111111"
const SLUG = "Kp7dRw3xYq"

const party = letterFixtures["party-invite"]
const invitation = {
  id: LETTER_ID,
  slug: SLUG,
  kind: "letter",
  template_id: "party-invite",
  content: { ...party, wishlist: [...party.wishlist!, { id: "fxpty04", title: "Fairy lights" }, { id: "fxpty05", title: "Board game" }] },
}

type Claim = { id: number; letter_id: string; item_id: string; guest_name: string | null; visitor_id: string }

// The admin client, reduced to the calls claim.ts makes. Inserts check the
// unique constraint after a tick, so concurrent claims interleave as they
// would against the database.
function fakeDb(letter: typeof invitation | Record<string, unknown> | null = invitation) {
  const claims: Claim[] = []
  let nextId = 1
  const client = {
    from(table: string) {
      if (table === "letters") {
        return {
          select: () => ({
            eq: (_column: string, slug: string) => ({
              maybeSingle: async () => ({ data: letter && letter.slug === slug ? letter : null, error: null }),
            }),
          }),
        }
      }
      return {
        select(_columns: string, opts?: { head?: boolean }) {
          const filters: [keyof Claim, unknown][] = []
          const query = {
            eq(column: keyof Claim, value: unknown) {
              filters.push([column, value])
              return query
            },
            then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
              const rows = claims.filter((row) => filters.every(([column, value]) => row[column] === value))
              const result = opts?.head ? { count: rows.length, error: null } : { data: rows.map((row) => ({ item_id: row.item_id })), error: null }
              return Promise.resolve(result).then(resolve, reject)
            },
          }
          return query
        },
        insert(row: Omit<Claim, "id">) {
          return {
            select: () => ({
              single: async () => {
                await new Promise((resolve) => setTimeout(resolve, 0))
                if (claims.some((c) => c.letter_id === row.letter_id && c.item_id === row.item_id)) {
                  return { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } }
                }
                const stored = { id: nextId++, ...row }
                claims.push(stored)
                return { data: { id: stored.id }, error: null }
              },
            }),
          }
        },
        delete() {
          return {
            eq: async (column: keyof Claim, value: unknown) => {
              for (let i = claims.length - 1; i >= 0; i--) if (claims[i][column] === value) claims.splice(i, 1)
              return { error: null }
            },
          }
        },
      }
    },
  }
  fakes.adminClient.mockReturnValue(client)
  return claims
}

const guest = { ip: "203.0.113.7", userAgent: "Mozilla/5.0 Test" }

beforeEach(() => {
  vi.stubEnv("OPEN_HASH_SECRET", "test-secret")
  fakes.adminClient.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("claimGift", () => {
  it("records the claim with the name and a hashed visitor, never the IP address", async () => {
    const claims = fakeDb()
    const result = await claimGift({ slug: SLUG, itemId: "fxpty02", guestName: "Sam", ...guest })
    expect(result).toEqual({ status: "claimed", claimed: ["fxpty02"] })
    expect(claims).toHaveLength(1)
    expect(claims[0]).toMatchObject({ letter_id: LETTER_ID, item_id: "fxpty02", guest_name: "Sam" })
    expect(claims[0].visitor_id).toMatch(/^[0-9a-f]{64}$/)
    expect(JSON.stringify(claims)).not.toContain(guest.ip)
  })

  it("answers taken for a gift someone already claimed, with the current list", async () => {
    fakeDb()
    await claimGift({ slug: SLUG, itemId: "fxpty01", guestName: null, ...guest })
    const second = await claimGift({ slug: SLUG, itemId: "fxpty01", guestName: "Ana", ip: "198.51.100.4", userAgent: "Other" })
    expect(second).toEqual({ status: "taken", claimed: ["fxpty01"] })
  })

  it("lets only one of two simultaneous claims on the same gift win", async () => {
    const claims = fakeDb()
    const results = await Promise.all([
      claimGift({ slug: SLUG, itemId: "fxpty03", guestName: "Sam", ...guest }),
      claimGift({ slug: SLUG, itemId: "fxpty03", guestName: "Ana", ip: "198.51.100.4", userAgent: "Other" }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual(["claimed", "taken"])
    expect(claims).toHaveLength(1)
  })

  it(`lets one visitor claim ${MAX_CLAIMS_PER_VISITOR} gifts and refuses the next, leaving no row for it`, async () => {
    const claims = fakeDb()
    const items = ["fxpty01", "fxpty02", "fxpty03", "fxpty04"]
    const results = []
    for (const itemId of items) results.push(await claimGift({ slug: SLUG, itemId, guestName: null, ...guest }))
    expect(results.map((r) => r.status)).toEqual(["claimed", "claimed", "claimed", "too_many"])
    expect(claims.map((c) => c.item_id)).toEqual(items.slice(0, 3))

    // Another visitor is not affected.
    const other = await claimGift({ slug: SLUG, itemId: "fxpty04", guestName: null, ip: "198.51.100.4", userAgent: "Other" })
    expect(other.status).toBe("claimed")
  })

  it("keeps a visitor within the limit even when the claims arrive all at once", async () => {
    const claims = fakeDb()
    const items = ["fxpty01", "fxpty02", "fxpty03", "fxpty04", "fxpty05"]
    await Promise.all(items.map((itemId) => claimGift({ slug: SLUG, itemId, guestName: null, ...guest })))
    expect(claims.length).toBeLessThanOrEqual(MAX_CLAIMS_PER_VISITOR)
  })

  it("accepts claims on the 3D wedding envelope and the party pop box (issue #52)", async () => {
    const envelope = letterFixtures["wedding-envelope-3d"]
    const claims = fakeDb({ ...invitation, template_id: "wedding-envelope-3d", content: envelope })
    expect(await claimGift({ slug: SLUG, itemId: "fxenv02", guestName: "Sam", ...guest })).toEqual({ status: "claimed", claimed: ["fxenv02"] })
    expect(claims[0]).toMatchObject({ item_id: "fxenv02", guest_name: "Sam" })

    fakeDb({ ...invitation, template_id: "party-box", content: { ...letterFixtures["party-box"], wishlist: party.wishlist } })
    expect(await claimGift({ slug: SLUG, itemId: "fxpty01", guestName: null, ...guest })).toEqual({ status: "claimed", claimed: ["fxpty01"] })

    // The 3D gift box stays a gift: no list, no claims.
    fakeDb({ ...invitation, template_id: "gift-box-3d" })
    expect(await claimGift({ slug: SLUG, itemId: "fxpty01", guestName: null, ...guest })).toEqual({ status: "not_found" })
  })

  it("refuses a gift that is not on the list", async () => {
    fakeDb()
    expect(await claimGift({ slug: SLUG, itemId: "nope", guestName: null, ...guest })).toEqual({ status: "item_not_found", claimed: [] })
  })

  it("refuses unknown slugs, demos, letters that are not invitations and invitations without a list", async () => {
    fakeDb()
    expect(await claimGift({ slug: "Zz9zZz9zZz", itemId: "fxpty01", guestName: null, ...guest })).toEqual({ status: "not_found" })
    expect(await claimGift({ slug: "demo-letter", itemId: "fxpty01", guestName: null, ...guest })).toEqual({ status: "not_found" })

    fakeDb({ ...invitation, template_id: "classic-envelope" })
    expect(await claimGift({ slug: SLUG, itemId: "fxpty01", guestName: null, ...guest })).toEqual({ status: "not_found" })

    const { wishlist: _list, ...noList } = invitation.content
    void _list
    fakeDb({ ...invitation, content: noList })
    expect(await claimGift({ slug: SLUG, itemId: "fxpty01", guestName: null, ...guest })).toEqual({ status: "not_found" })
  })

  it("is unavailable without OPEN_HASH_SECRET and writes nothing", async () => {
    vi.stubEnv("OPEN_HASH_SECRET", "")
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    const claims = fakeDb()
    expect(await claimGift({ slug: SLUG, itemId: "fxpty01", guestName: null, ...guest })).toEqual({ status: "unavailable" })
    expect(claims).toEqual([])
    warn.mockRestore()
  })
})

describe("getClaimedItemIds", () => {
  it("lists the claimed gifts of an invitation", async () => {
    fakeDb()
    await claimGift({ slug: SLUG, itemId: "fxpty02", guestName: null, ...guest })
    expect(await getClaimedItemIds(SLUG)).toEqual(["fxpty02"])
  })

  it("is empty for unknown slugs and demos, without asking the database for demos", async () => {
    fakeDb()
    expect(await getClaimedItemIds("Zz9zZz9zZz")).toEqual([])
    fakes.adminClient.mockReset()
    expect(await getClaimedItemIds("demo-letter")).toEqual([])
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })
})

describe("claimedIdsForPage", () => {
  it("reads the claimed ids while the invitation renders", async () => {
    fakeDb()
    await claimGift({ slug: SLUG, itemId: "fxpty01", guestName: null, ...guest })
    expect(await claimedIdsForPage(SLUG, invitation.content)).toEqual(["fxpty01"])
  })

  it("looks nothing up without a slug or without a gift list", async () => {
    const { wishlist: _list, ...noList } = invitation.content
    void _list
    expect(await claimedIdsForPage(undefined, invitation.content)).toBeUndefined()
    expect(await claimedIdsForPage(SLUG, noList)).toBeUndefined()
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })

  it("gives undefined instead of failing when the database is down, so the page still renders", async () => {
    fakes.adminClient.mockImplementation(() => {
      throw new Error("database down")
    })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await claimedIdsForPage(SLUG, invitation.content)).toBeUndefined()
    error.mockRestore()
  })
})
