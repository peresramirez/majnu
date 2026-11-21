import { describe, expect, it } from "vitest"
import {
  ClaimRequest,
  changeGiftList,
  cleanGuestName,
  ITEM_ID,
  MAX_GIFT_LIST_ITEMS,
  newItemId,
  takesGiftList,
  toWishlistItem,
} from "@/lib/claims/rules"

function ids(prefix: string) {
  let n = 0
  return () => `${prefix}${++n}`
}

describe("takesGiftList", () => {
  it("is true only for wedding and party invitations", () => {
    expect(takesGiftList("wedding-invite")).toBe(true)
    expect(takesGiftList("party-invite")).toBe(true)
    expect(takesGiftList("classic-envelope")).toBe(false)
    expect(takesGiftList("advent-classic")).toBe(false)
    expect(takesGiftList(null)).toBe(false)
  })
})

describe("ClaimRequest", () => {
  it("accepts a slug, an item id and an optional name", () => {
    expect(ClaimRequest.safeParse({ slug: "Kp7dRw3xYq", itemId: "fxpty01" }).success).toBe(true)
    expect(ClaimRequest.safeParse({ slug: "Kp7dRw3xYq", itemId: "fxpty01", name: "Sam" }).success).toBe(true)
  })

  it("refuses slugs and ids that could not exist", () => {
    expect(ClaimRequest.safeParse({ slug: "../x", itemId: "fxpty01" }).success).toBe(false)
    expect(ClaimRequest.safeParse({ slug: "Kp7dRw3xYq", itemId: "a b" }).success).toBe(false)
    expect(ClaimRequest.safeParse({ slug: "Kp7dRw3xYq", itemId: "" }).success).toBe(false)
    expect(ClaimRequest.safeParse({ slug: "Kp7dRw3xYq", itemId: "fxpty01", name: "x".repeat(201) }).success).toBe(false)
  })
})

describe("cleanGuestName", () => {
  it("trims, collapses spaces and removes control characters", () => {
    expect(cleanGuestName("  Sam \n  Lee\u0000 ")).toBe("Sam Lee")
    expect(cleanGuestName("‮Sam")).toBe("Sam")
  })

  it("is null when nothing is left", () => {
    expect(cleanGuestName(undefined)).toBeNull()
    expect(cleanGuestName("   ")).toBeNull()
  })

  it("keeps at most 40 characters without splitting an emoji", () => {
    expect(Array.from(cleanGuestName("a".repeat(60))!)).toHaveLength(40)
    expect(cleanGuestName(`${"a".repeat(39)}😀😀`)).toBe(`${"a".repeat(39)}😀`)
  })
})

describe("newItemId", () => {
  it("makes ids the claim route and the database accept, different every time", () => {
    const made = new Set(Array.from({ length: 200 }, newItemId))
    expect(made.size).toBe(200)
    for (const id of made) expect(id).toMatch(ITEM_ID)
  })
})

describe("toWishlistItem", () => {
  it("keeps only https links", () => {
    expect(toWishlistItem({ title: "Vase", url: "https://shop.example/vase" }, "a")).toEqual({ id: "a", title: "Vase", url: "https://shop.example/vase" })
    expect(toWishlistItem({ title: "Vase", url: "javascript:alert(1)" }, "a")).toEqual({ id: "a", title: "Vase" })
    expect(toWishlistItem({ title: "Vase", url: "http://shop.example" }, "a")).toEqual({ id: "a", title: "Vase" })
  })

  it("drops a gift without a title and empty optional fields", () => {
    expect(toWishlistItem({ title: "  " }, "a")).toBeNull()
    expect(toWishlistItem({ title: "Vase", description: " ", price: "" }, "a")).toEqual({ id: "a", title: "Vase" })
  })
})

describe("changeGiftList", () => {
  const current = [
    { id: "old1", title: "Vase" },
    { id: "old2", title: "Linen bedding", price: "€140" },
  ]

  it("adds at the end with new ids and keeps existing ids, so claims stay valid", () => {
    const change = changeGiftList(current, { add: [{ title: "Teapot", price: "€40" }] }, ids("new"))
    expect(change.list.map((item) => item.id)).toEqual(["old1", "old2", "new1"])
    expect(change.added).toEqual([{ id: "new1", title: "Teapot", price: "€40" }])
  })

  it("removes by id and reports ids that are not on the list", () => {
    const change = changeGiftList(current, { removeIds: ["old1", "nope"] }, ids("new"))
    expect(change.list.map((item) => item.id)).toEqual(["old2"])
    expect(change.removed.map((item) => item.id)).toEqual(["old1"])
    expect(change.unknownIds).toEqual(["nope"])
  })

  it("does not add the same gift twice", () => {
    const change = changeGiftList(current, { add: [{ title: "vase" }, { title: "Teapot" }, { title: "Teapot" }] }, ids("new"))
    expect(change.list.map((item) => item.title)).toEqual(["Vase", "Linen bedding", "Teapot"])
  })

  it(`stops at ${MAX_GIFT_LIST_ITEMS} gifts and says which were left out`, () => {
    const add = Array.from({ length: 14 }, (_, i) => ({ title: `Gift ${i + 1}` }))
    const change = changeGiftList([], { add }, ids("g"))
    expect(change.list).toHaveLength(MAX_GIFT_LIST_ITEMS)
    expect(change.overLimit).toEqual(["Gift 13", "Gift 14"])
  })

  it("never reuses an id that is already on the list", () => {
    const sequence = ["old1", "old1", "fresh"]
    const change = changeGiftList(current, { add: [{ title: "Teapot" }] }, () => sequence.shift()!)
    expect(change.added[0].id).toBe("fresh")
  })
})
