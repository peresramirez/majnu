// The host's side of a gift list (issue #35): who claimed what, for My gifts,
// and releasing a claim. Reads use the host's own session, so row-level
// security limits them to the host's letters and the claims on them. A release
// is a write, which only server code may make: it proves ownership through RLS
// first, then deletes with the service-role client.
import "server-only"
import * as z from "zod/v4"
import { WishlistItem } from "@/lib/letters/schema"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { GIFT_LIST_TEMPLATES, ITEM_ID } from "./rules"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type HostGiftListItem = {
  id: string
  title: string
  price?: string
  // Null while nobody has claimed it.
  claim: { guestName: string | null; claimedAt: string } | null
}

// The gift list of one invitation, in list order.
export type HostGiftList = { letterId: string; items: HostGiftListItem[] }

type ListRow = { id: string; wishlist: unknown }
type ClaimRow = { letter_id: string; item_id: string; guest_name: string | null; created_at: string }

// Every invitation of the signed-in host that has a gift list, by letter id.
// Claims on gifts the host has since taken off the list are not shown.
export async function listMyGiftLists(): Promise<Record<string, HostGiftList>> {
  const supabase = await createClient()
  const { data: letters, error } = await supabase
    .from("letters")
    .select("id, wishlist:content->wishlist")
    .eq("kind", "letter")
    .in("template_id", [...GIFT_LIST_TEMPLATES])
    .returns<ListRow[]>()
  if (error) throw new Error(`Could not load your gift lists: ${error.message}`)

  const lists = new Map<string, z.infer<typeof WishlistItem>[]>()
  for (const row of letters ?? []) {
    const wishlist = z.array(WishlistItem).safeParse(row.wishlist)
    if (wishlist.success && wishlist.data.length) lists.set(row.id, wishlist.data)
  }
  if (lists.size === 0) return {}

  // visitor_id is left out on purpose: owners have no grant on it.
  const { data: claims, error: claimsError } = await supabase
    .from("gift_claims")
    .select("letter_id, item_id, guest_name, created_at")
    .in("letter_id", [...lists.keys()])
    .returns<ClaimRow[]>()
  if (claimsError) throw new Error(`Could not load the claims: ${claimsError.message}`)

  const byItem = new Map<string, ClaimRow>()
  for (const claim of claims ?? []) byItem.set(`${claim.letter_id}/${claim.item_id}`, claim)

  const result: Record<string, HostGiftList> = {}
  for (const [letterId, wishlist] of lists) {
    result[letterId] = {
      letterId,
      items: wishlist.map((item) => {
        const claim = byItem.get(`${letterId}/${item.id}`)
        return {
          id: item.id,
          title: item.title,
          ...(item.price ? { price: item.price } : {}),
          claim: claim ? { guestName: claim.guest_name, claimedAt: claim.created_at } : null,
        }
      }),
    }
  }
  return result
}

export type ReleaseResult = "released" | "not_found" | "signed_out"

// Releases the claim on one gift, so another guest can claim it. Only the
// letter's owner may: the letter must be readable with their own session.
// Releasing a gift nobody claimed is not an error.
export async function releaseClaim(letterId: string, itemId: string): Promise<ReleaseResult> {
  if (!UUID.test(letterId) || !ITEM_ID.test(itemId)) return "not_found"
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return "signed_out"

  const { data: owned, error } = await supabase
    .from("letters")
    .select("id")
    .eq("id", letterId)
    .eq("owner_id", user.id)
    .maybeSingle<{ id: string }>()
  if (error) throw new Error(`Could not check the letter: ${error.message}`)
  if (!owned) return "not_found"

  const admin = createAdminClient()
  const { error: deleteError } = await admin.from("gift_claims").delete().eq("letter_id", owned.id).eq("item_id", itemId)
  if (deleteError) throw new Error(`Could not release the claim: ${deleteError.message}`)
  return "released"
}
