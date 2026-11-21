// What the gift list on an invitation shows (issue #35), as plain data:
// each gift's state, whether it can be claimed now, and how an answer from
// POST /api/claim changes the list. Kept apart from wishlist.tsx so it can be
// unit-tested (the test runner cannot load .tsx).
import type { WishlistItem } from "@/lib/letters/schema"
import { safeHttps } from "./urls"

// open: anyone can claim it. taken: someone claimed it. mine: this guest
// claimed it while the page was open. gone: the host took it off the list.
export type RowState = "open" | "taken" | "mine" | "gone"

export type GiftListRow = {
  item: WishlistItem
  state: RowState
  // The "I'll bring this" button works: the gift is open, the taken gifts are
  // known, and this is not the host's own preview.
  canClaim: boolean
  // The shop link, https only.
  url: string | null
}

export type GiftListView = {
  rows: GiftListRow[]
  intro: string
  // "1 of 3 already taken", or null while nothing is taken or nothing is known.
  summary: string | null
}

export function giftListView(input: {
  items: WishlistItem[]
  // Null while the taken gifts are not known yet.
  taken: ReadonlySet<string> | null
  mine: ReadonlySet<string>
  gone: ReadonlySet<string>
  ownerPreview: boolean
}): GiftListView {
  const { items, taken, mine, gone, ownerPreview } = input
  const rows = items.map((item): GiftListRow => {
    const state: RowState = gone.has(item.id) ? "gone" : mine.has(item.id) ? "mine" : taken?.has(item.id) ? "taken" : "open"
    return { item, state, canClaim: state === "open" && taken !== null && !ownerPreview, url: safeHttps(item.url) }
  })
  const takenCount = taken ? items.filter((item) => taken.has(item.id)).length : 0
  return {
    rows,
    intro: ownerPreview
      ? "Guests tap “I’ll bring this” on the link you send. You see who in My gifts."
      : "Pick one and it is marked as taken for everyone else, so nothing doubles up.",
    summary: takenCount > 0 ? `${takenCount} of ${items.length} already taken` : null,
  }
}

export type ClaimOutcome = {
  // Every gift id claimed now, from the server; null when the answer had none.
  claimed: string[] | null
  // The guest now has this gift.
  mine: boolean
  // The gift is no longer on the list.
  gone: boolean
  // Close the name form: the claim is done or can never succeed.
  closeForm: boolean
  message: string
}

function idsFrom(value: unknown): string[] | null {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : null
}

// The ids in a GET /api/claim answer, or an empty list for anything else.
export function claimedFrom(body: unknown): string[] {
  return idsFrom((body as { claimed?: unknown } | null)?.claimed) ?? []
}

// How the list changes after POST /api/claim answered `status` with `body`.
export function claimOutcome(status: number, body: unknown, hostName: string): ClaimOutcome {
  const answer = (body ?? {}) as { ok?: unknown; error?: unknown; claimed?: unknown }
  const claimed = idsFrom(answer.claimed)
  const base = { claimed, mine: false, gone: false, closeForm: false }
  if (status === 200 && answer.ok === true) {
    return { ...base, mine: true, closeForm: true, message: `Thank you. ${hostName} will know you are bringing it.` }
  }
  switch (answer.error) {
    case "taken":
      return { ...base, closeForm: true, message: "Someone has just claimed this one. Maybe pick another?" }
    case "item_not_found":
      return { ...base, gone: true, closeForm: true, message: "This gift is no longer on the list." }
    case "too_many":
      return { ...base, closeForm: true, message: "You have already picked a few gifts. Thank you." }
    default:
      return { ...base, message: "That did not work. Please try again in a moment." }
  }
}
