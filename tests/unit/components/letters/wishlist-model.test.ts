// What the gift list on an invitation renders: which gifts are taken, which can
// be claimed, and how each answer from POST /api/claim changes it. The test
// runner cannot load .tsx (tsconfig keeps JSX for Next.js), so wishlist.tsx
// renders this model and is checked in the browser on /dev/templates.
import { describe, expect, it } from "vitest"
import { claimedFrom, claimOutcome, giftListView, nameHint } from "@/components/letters/wishlist-model"
import { letterFixtures } from "@/lib/letters/fixtures"

const items = letterFixtures["party-invite"].wishlist!
const none = new Set<string>()

function states(view: ReturnType<typeof giftListView>) {
  return view.rows.map((row) => [row.item.id, row.state, row.canClaim])
}

describe("giftListView", () => {
  it("renders claimed gifts as taken and lets guests claim only the others", () => {
    const view = giftListView({ items, taken: new Set(["fxpty02"]), mine: none, gone: none, ownerPreview: false })
    expect(states(view)).toEqual([
      ["fxpty01", "open", true],
      ["fxpty02", "taken", false],
      ["fxpty03", "open", true],
    ])
    expect(view.summary).toBe("1 of 3 already taken")
  })

  it("keeps every gift in list order with its title, description and price", () => {
    const view = giftListView({ items, taken: none, mine: none, gone: none, ownerPreview: false })
    expect(view.rows.map((row) => row.item)).toEqual(items)
    expect(view.summary).toBeNull()
  })

  it("lets nobody claim until the taken gifts are known", () => {
    const view = giftListView({ items, taken: null, mine: none, gone: none, ownerPreview: false })
    expect(view.rows.every((row) => row.state === "open" && !row.canClaim)).toBe(true)
  })

  it("shows taken gifts in the host's preview but lets the host claim nothing", () => {
    const view = giftListView({ items, taken: new Set(["fxpty01"]), mine: none, gone: none, ownerPreview: true })
    expect(states(view)).toEqual([
      ["fxpty01", "taken", false],
      ["fxpty02", "open", false],
      ["fxpty03", "open", false],
    ])
    expect(view.intro).toContain("on the link you send")
  })

  it("marks the guest's own claim and gifts the host removed", () => {
    const view = giftListView({ items, taken: new Set(["fxpty01"]), mine: new Set(["fxpty01"]), gone: new Set(["fxpty03"]), ownerPreview: false })
    expect(view.rows.map((row) => row.state)).toEqual(["mine", "open", "gone"])
  })

  it("links only to https shops", () => {
    const view = giftListView({
      items: [
        { id: "x1", title: "Vase", url: "https://shop.example/vase" },
        { id: "x2", title: "Lamp", url: "javascript:alert(1)" },
        { id: "x3", title: "Rug" },
      ],
      taken: none,
      mine: none,
      gone: none,
      ownerPreview: false,
    })
    expect(view.rows.map((row) => row.url)).toEqual(["https://shop.example/vase", null, null])
  })
})

describe("claimOutcome", () => {
  it("makes a successful claim the guest's and updates the whole list", () => {
    expect(claimOutcome(200, { ok: true, claimed: ["fxpty01", "fxpty03"] }, "Mia")).toEqual({
      claimed: ["fxpty01", "fxpty03"],
      mine: true,
      gone: false,
      closeForm: true,
      message: "Thank you. Mia will know you are bringing it.",
    })
  })

  it("shows a gift someone else claimed first as taken", () => {
    const outcome = claimOutcome(409, { ok: false, error: "taken", claimed: ["fxpty01"] }, "Mia")
    expect(outcome).toMatchObject({ claimed: ["fxpty01"], mine: false, closeForm: true })
    expect(outcome.message).toContain("just claimed")
  })

  it("marks a removed gift as gone and explains the visitor limit", () => {
    expect(claimOutcome(404, { ok: false, error: "item_not_found", claimed: [] }, "Mia")).toMatchObject({ gone: true, closeForm: true })
    expect(claimOutcome(429, { ok: false, error: "too_many", claimed: ["a"] }, "Mia").message).toContain("already picked")
  })

  it("keeps the form open to try again after any other failure", () => {
    for (const [status, body] of [
      [500, { ok: false, error: "server_error" }],
      [502, null],
      [200, { ok: false }],
    ] as const) {
      const outcome = claimOutcome(status, body, "Mia")
      expect(outcome).toMatchObject({ claimed: null, mine: false, closeForm: false })
      expect(outcome.message).toContain("try again")
    }
  })
})

describe("claimedFrom", () => {
  it("reads the ids from GET /api/claim and ignores anything else", () => {
    expect(claimedFrom({ claimed: ["a", 1, "b"] })).toEqual(["a", "b"])
    expect(claimedFrom(null)).toEqual([])
    expect(claimedFrom({ error: "server_error" })).toEqual([])
  })
})

describe("the host's name in the claim form (issue #62)", () => {
  it("agrees with one host or a couple", () => {
    expect(nameHint("Mia")).toBe("Only Mia sees it.")
    expect(nameHint("Mia & Leo")).toBe("Only Mia & Leo see it.")
    expect(nameHint("Clara and Ben")).toBe("Only Clara and Ben see it.")
  })

  it("names the host on an invitation that is not signed", () => {
    expect(nameHint("")).toBe("Only the host sees it.")
    expect(claimOutcome(200, { ok: true, claimed: [] }, "").message).toBe("Thank you. The host will know you are bringing it.")
  })

  it("starts the thank-you with a capital", () => {
    expect(claimOutcome(200, { ok: true, claimed: [] }, "our family").message).toBe("Thank you. Our family will know you are bringing it.")
  })
})
