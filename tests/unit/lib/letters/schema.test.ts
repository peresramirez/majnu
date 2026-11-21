// The gift list added to the letter contract (issue #35): optional and additive,
// so every letter stored before it still parses.
import { describe, expect, it } from "vitest"
import { letterFixtures } from "@/lib/letters/fixtures"
import { toPublicView } from "@/lib/letters/public-view"
import { LetterContent, WishlistItem, type LetterRecord } from "@/lib/letters/schema"

const { wishlist: _wishlist, ...withoutList } = letterFixtures["party-invite"]
void _wishlist

describe("LetterContent.wishlist", () => {
  it("is optional: a letter without a gift list parses as before", () => {
    const parsed = LetterContent.safeParse(withoutList)
    expect(parsed.success).toBe(true)
    expect(parsed.data).not.toHaveProperty("wishlist")
  })

  it("keeps items with their ids, in order", () => {
    const parsed = LetterContent.parse(letterFixtures["party-invite"])
    expect(parsed.wishlist?.map((item) => item.id)).toEqual(["fxpty01", "fxpty02", "fxpty03"])
  })

  it("needs an id and a title on every item; description, price and link are optional", () => {
    expect(WishlistItem.safeParse({ id: "a1", title: "Vase" }).success).toBe(true)
    expect(WishlistItem.safeParse({ title: "Vase" }).success).toBe(false)
    expect(WishlistItem.safeParse({ id: "a1" }).success).toBe(false)
    expect(LetterContent.safeParse({ ...withoutList, wishlist: [{ id: "a1" }] }).success).toBe(false)
  })

  it("reaches the public view, so the invitation can show it", () => {
    const record: LetterRecord = {
      id: "l1",
      ownerId: "o1",
      slug: "Kp7dRw3xYq",
      kind: "letter",
      templateId: "party-invite",
      title: null,
      content: letterFixtures["party-invite"],
      createdAt: "2026-11-21T10:00:00Z",
      updatedAt: "2026-11-21T10:00:00Z",
    }
    const view = toPublicView(record, new Date("2026-11-21T12:00:00Z"), { ownerPreview: false })
    expect(view?.kind === "letter" && view.content.wishlist).toEqual(letterFixtures["party-invite"].wishlist)
  })
})
