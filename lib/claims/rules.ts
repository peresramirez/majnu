// The rules of a gift list on an invitation (issue #35): which letters can have
// one, what a claim request looks like, and how the list changes when the host
// adds or removes gifts. Pure and free of server-only imports, so the route,
// the agent tool, the page and the tests share one definition.
import * as z from "zod/v4"
import type { TemplateId, WishlistItem } from "@/lib/letters/schema"

// Only these templates show a gift list and accept claims: the two invitations,
// the 3D wedding envelope (issue #52), and the party pop box, which is a party
// invitation when it carries an event. The agent's update_gift_list, POST
// /api/claim and the host's view in My gifts all go by this list.
export const GIFT_LIST_TEMPLATES = ["wedding-invite", "party-invite", "wedding-envelope-3d", "party-box"] as const satisfies readonly TemplateId[]

export function takesGiftList(templateId: TemplateId | string | null | undefined): boolean {
  return (GIFT_LIST_TEMPLATES as readonly string[]).includes(templateId ?? "")
}

// A list long enough for a wedding and short enough to read on a phone.
export const MAX_GIFT_LIST_ITEMS = 12
// One guest may claim a few gifts on one invitation, not the whole list. Counted
// per visitor hash (lib/open/visitor.ts), so nothing is stored on the device.
export const MAX_CLAIMS_PER_VISITOR = 3
// Matches the check in supabase/migrations/0006_gift_claims.sql.
export const MAX_GUEST_NAME = 40

export const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/
export const SLUG = /^[A-Za-z0-9_-]{6,64}$/

const MAX_TITLE = 120
const MAX_DESCRIPTION = 300
const MAX_PRICE = 40
const MAX_URL = 2048

// The body of POST /api/claim. `name` is cleaned with cleanGuestName() after parsing.
export const ClaimRequest = z.object({
  slug: z.string().regex(SLUG),
  itemId: z.string().regex(ITEM_ID),
  name: z.string().max(200).optional(),
})
export type ClaimRequest = z.infer<typeof ClaimRequest>

// The first name a guest leaves for the host: control characters removed,
// spaces collapsed, at most 40 characters. Null when nothing is left.
export function cleanGuestName(name: string | null | undefined): string | null {
  if (!name) return null
  const cleaned = name
    .replace(/[\p{Cc}\p{Cf}]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!cleaned) return null
  // Code points, as Postgres char_length counts them, so a name never ends in half an emoji.
  return Array.from(cleaned).slice(0, MAX_GUEST_NAME).join("").trim() || null
}

// ---------- Changing the list ----------

export type GiftListItemInput = { title: string; description?: string; price?: string; url?: string }

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

// A random 10-character id: claims refer to it, so it must never be reused for
// another gift on the same list.
export function newItemId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10))
  return Array.from(bytes, (b) => ID_ALPHABET[b % ID_ALPHABET.length]).join("")
}

function clip(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.replace(/\s+/g, " ").trim()
  return trimmed ? Array.from(trimmed).slice(0, max).join("") : undefined
}

// Only https links reach the page; anything else is left out.
export function httpsLink(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  if (!trimmed || trimmed.length > MAX_URL) return undefined
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : undefined
  } catch {
    return undefined
  }
}

// One gift as it is stored, or null when it has no title.
export function toWishlistItem(input: GiftListItemInput, id: string): WishlistItem | null {
  const title = clip(input.title, MAX_TITLE)
  if (!title) return null
  const description = clip(input.description, MAX_DESCRIPTION)
  const price = clip(input.price, MAX_PRICE)
  const url = httpsLink(input.url)
  return { id, title, ...(description ? { description } : {}), ...(price ? { price } : {}), ...(url ? { url } : {}) }
}

export type GiftListChange = {
  list: WishlistItem[]
  added: WishlistItem[]
  removed: WishlistItem[]
  // Ids asked to be removed that are not on the list.
  unknownIds: string[]
  // Gifts left out because the list was full, by title.
  overLimit: string[]
}

// Removes first, then adds at the end. Existing items keep their ids, so the
// claims on them stay valid; a gift already on the list (same title and link)
// is not added twice.
export function changeGiftList(
  current: WishlistItem[] | undefined,
  change: { add?: GiftListItemInput[]; removeIds?: string[] },
  makeId: () => string = newItemId,
): GiftListChange {
  const removeIds = new Set(change.removeIds ?? [])
  const existing = current ?? []
  const removed = existing.filter((item) => removeIds.has(item.id))
  const list = existing.filter((item) => !removeIds.has(item.id))
  const unknownIds = [...removeIds].filter((id) => !existing.some((item) => item.id === id))

  const key = (item: { title: string; url?: string }) => `${item.title.toLowerCase()}\n${item.url ?? ""}`
  const seen = new Set(list.map(key))
  const usedIds = new Set(existing.map((item) => item.id))
  const added: WishlistItem[] = []
  const overLimit: string[] = []

  for (const input of change.add ?? []) {
    let id = makeId()
    while (usedIds.has(id)) id = makeId()
    const item = toWishlistItem(input, id)
    if (!item || seen.has(key(item))) continue
    if (list.length >= MAX_GIFT_LIST_ITEMS) {
      overLimit.push(item.title)
      continue
    }
    usedIds.add(id)
    seen.add(key(item))
    list.push(item)
    added.push(item)
  }
  return { list, added, removed, unknownIds, overLimit }
}
