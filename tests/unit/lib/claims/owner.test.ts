// Releasing a claim and the host's view of a gift list, with both Supabase
// clients replaced by fakes. The user's client stands in for row-level
// security: it only returns the letters the fake says the user owns.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { listMyGiftLists, releaseClaim } from "@/lib/claims/owner"

const fakes = vi.hoisted(() => ({ adminClient: vi.fn(), userClient: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: fakes.adminClient }))
vi.mock("@/lib/supabase/server", () => ({ createClient: fakes.userClient }))

const LETTER_ID = "11111111-1111-4111-8111-111111111111"
const OTHER_LETTER = "22222222-2222-4222-8222-222222222222"
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

let deletes: [string, unknown][][]

function fakeAdmin() {
  deletes = []
  fakes.adminClient.mockReturnValue({
    from: () => ({
      delete: () => {
        const filters: [string, unknown][] = []
        deletes.push(filters)
        const query = {
          eq(column: string, value: unknown) {
            filters.push([column, value])
            return query
          },
          then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
        }
        return query
      },
    }),
  })
}

function fakeUser(opts: { signedIn?: boolean; owns?: string[]; letters?: unknown[]; claims?: unknown[] }) {
  const owns = opts.owns ?? []
  fakes.userClient.mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: opts.signedIn === false ? null : { id: USER } } }) },
    from(table: string) {
      if (table === "letters") {
        return {
          select: () => {
            const filters: Record<string, unknown> = {}
            const query = {
              eq(column: string, value: unknown) {
                filters[column] = value
                return query
              },
              in: () => query,
              returns: async () => ({ data: opts.letters ?? [], error: null }),
              maybeSingle: async () => ({ data: owns.includes(String(filters.id)) ? { id: filters.id } : null, error: null }),
            }
            return query
          },
        }
      }
      return { select: () => ({ in: () => ({ returns: async () => ({ data: opts.claims ?? [], error: null }) }) }) }
    },
  })
}

beforeEach(() => {
  fakes.adminClient.mockReset()
  fakes.userClient.mockReset()
  fakeAdmin()
})

describe("releaseClaim", () => {
  it("deletes the claim on the owner's own letter", async () => {
    fakeUser({ owns: [LETTER_ID] })
    expect(await releaseClaim(LETTER_ID, "fxpty01")).toBe("released")
    expect(deletes).toEqual([
      [
        ["letter_id", LETTER_ID],
        ["item_id", "fxpty01"],
      ],
    ])
  })

  it("deletes nothing on someone else's letter", async () => {
    fakeUser({ owns: [LETTER_ID] })
    expect(await releaseClaim(OTHER_LETTER, "fxpty01")).toBe("not_found")
    expect(deletes).toEqual([])
    expect(fakes.adminClient).not.toHaveBeenCalled()
  })

  it("deletes nothing when signed out or for ids that cannot exist", async () => {
    fakeUser({ signedIn: false, owns: [LETTER_ID] })
    expect(await releaseClaim(LETTER_ID, "fxpty01")).toBe("signed_out")
    fakeUser({ owns: [LETTER_ID] })
    expect(await releaseClaim("not-a-uuid", "fxpty01")).toBe("not_found")
    expect(await releaseClaim(LETTER_ID, "a b")).toBe("not_found")
    expect(deletes).toEqual([])
  })
})

describe("listMyGiftLists", () => {
  it("shows every gift in list order with who claimed it, or a guest without a name", async () => {
    fakeUser({
      letters: [
        { id: LETTER_ID, wishlist: [{ id: "a", title: "Vase", price: "€30" }, { id: "b", title: "Teapot" }, { id: "c", title: "Lamp" }] },
        { id: OTHER_LETTER, wishlist: null },
      ],
      claims: [
        { letter_id: LETTER_ID, item_id: "b", guest_name: null, created_at: "2026-11-21T10:00:00Z" },
        { letter_id: LETTER_ID, item_id: "a", guest_name: "Sam", created_at: "2026-11-21T09:00:00Z" },
        // A gift the host took off the list: not shown.
        { letter_id: LETTER_ID, item_id: "gone", guest_name: "Ana", created_at: "2026-11-21T08:00:00Z" },
      ],
    })
    expect(await listMyGiftLists()).toEqual({
      [LETTER_ID]: {
        letterId: LETTER_ID,
        items: [
          { id: "a", title: "Vase", price: "€30", claim: { guestName: "Sam", claimedAt: "2026-11-21T09:00:00Z" } },
          { id: "b", title: "Teapot", claim: { guestName: null, claimedAt: "2026-11-21T10:00:00Z" } },
          { id: "c", title: "Lamp", claim: null },
        ],
      },
    })
  })

  it("is empty when no invitation has a list", async () => {
    fakeUser({ letters: [] })
    expect(await listMyGiftLists()).toEqual({})
  })
})
