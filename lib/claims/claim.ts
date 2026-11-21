// Guests' claims on an invitation's gift list (issue #35), with the
// service-role client: there is no anonymous access to gift_claims, so the
// public page and POST /api/claim read and write here, on the server, by exact
// slug. See supabase/migrations/0006_gift_claims.sql.
import "server-only"
import { demoSlugs } from "@/lib/letters/fixtures"
import { LetterContent } from "@/lib/letters/schema"
import { visitorId } from "@/lib/open/visitor"
import { createAdminClient } from "@/lib/supabase/admin"
import { MAX_CLAIMS_PER_VISITOR, SLUG, takesGiftList } from "./rules"

const MAX_USER_AGENT = 512

export type ClaimResult =
  | { status: "claimed"; claimed: string[] }
  // Someone else claimed this gift first, possibly a moment ago.
  | { status: "taken"; claimed: string[] }
  // The letter has a gift list, but not this item (the host took it off).
  | { status: "item_not_found"; claimed: string[] }
  // This visitor already claimed MAX_CLAIMS_PER_VISITOR gifts on this invitation.
  | { status: "too_many"; claimed: string[] }
  // No such letter, a demo, a letter that is not an invitation, or one without a gift list.
  | { status: "not_found" }
  // OPEN_HASH_SECRET is not set, so visitors cannot be told apart.
  | { status: "unavailable" }

type Admin = ReturnType<typeof createAdminClient>

function isDemo(slug: string): boolean {
  return Object.hasOwn(demoSlugs, slug)
}

// The letter behind a slug, if it is an invitation with a gift list.
async function invitationWithList(admin: Admin, slug: string) {
  const { data, error } = await admin
    .from("letters")
    .select("id, kind, template_id, content")
    .eq("slug", slug)
    .maybeSingle<{ id: string; kind: string; template_id: string | null; content: unknown }>()
  if (error) throw new Error(`Could not load the letter: ${error.message}`)
  if (!data || data.kind !== "letter" || !takesGiftList(data.template_id)) return null
  const content = LetterContent.safeParse(data.content)
  if (!content.success || !content.data.wishlist?.length) return null
  return { id: data.id, wishlist: content.data.wishlist }
}

async function claimedOn(admin: Admin, letterId: string): Promise<string[]> {
  const { data, error } = await admin.from("gift_claims").select("item_id").eq("letter_id", letterId)
  if (error) throw new Error(`Could not load the claims: ${error.message}`)
  return (data ?? []).map((row: { item_id: string }) => row.item_id)
}

// The ids of the gifts already claimed on the invitation at `slug`, for the
// page to render as taken. Empty for unknown slugs, demos and letters without
// a gift list.
export async function getClaimedItemIds(slug: string): Promise<string[]> {
  if (!SLUG.test(slug) || isDemo(slug)) return []
  const admin = createAdminClient()
  const letter = await invitationWithList(admin, slug)
  return letter ? claimedOn(admin, letter.id) : []
}

// Records one guest's claim. Only one claim per gift can exist: the unique
// constraint on (letter_id, item_id) decides between two guests claiming at
// the same moment, and the loser gets "taken".
//
// The per-visitor limit inserts first and counts afterwards, deleting its own
// row when it went over, so a visitor sending many claims at once cannot slip
// past a count taken before the inserts.
export async function claimGift(input: {
  slug: string
  itemId: string
  guestName: string | null
  ip: string
  userAgent: string
}): Promise<ClaimResult> {
  if (!SLUG.test(input.slug) || isDemo(input.slug)) return { status: "not_found" }
  const secret = process.env.OPEN_HASH_SECRET
  if (!secret) {
    console.warn("gift claims are off: OPEN_HASH_SECRET is not set")
    return { status: "unavailable" }
  }

  const admin = createAdminClient()
  const letter = await invitationWithList(admin, input.slug)
  if (!letter) return { status: "not_found" }
  if (!letter.wishlist.some((item) => item.id === input.itemId)) {
    return { status: "item_not_found", claimed: await claimedOn(admin, letter.id) }
  }

  const visitor = await visitorId({
    letterId: letter.id,
    ip: input.ip,
    userAgent: input.userAgent.slice(0, MAX_USER_AGENT),
    secret,
  })

  const { data: inserted, error: insertError } = await admin
    .from("gift_claims")
    .insert({ letter_id: letter.id, item_id: input.itemId, guest_name: input.guestName, visitor_id: visitor })
    .select("id")
    .single<{ id: number }>()
  if (insertError) {
    // 23505: unique violation. Another claim on this gift exists.
    if (insertError.code === "23505") return { status: "taken", claimed: await claimedOn(admin, letter.id) }
    throw new Error(`Could not record the claim: ${insertError.message}`)
  }

  const { count, error: countError } = await admin
    .from("gift_claims")
    .select("id", { count: "exact", head: true })
    .eq("letter_id", letter.id)
    .eq("visitor_id", visitor)
  if (countError) throw new Error(`Could not count the claims: ${countError.message}`)
  if ((count ?? 0) > MAX_CLAIMS_PER_VISITOR) {
    const { error: deleteError } = await admin.from("gift_claims").delete().eq("id", inserted.id)
    if (deleteError) throw new Error(`Could not undo the claim over the limit: ${deleteError.message}`)
    return { status: "too_many", claimed: await claimedOn(admin, letter.id) }
  }

  return { status: "claimed", claimed: await claimedOn(admin, letter.id) }
}

// What the invitation page passes to its gift list while it renders: the
// claimed ids, or undefined when there is nothing to look up (no slug, no
// list) or the lookup failed. A failed lookup must never take the invitation
// down; the list then asks GET /api/claim after loading.
export async function claimedIdsForPage(slug: string | undefined, content: LetterContent): Promise<string[] | undefined> {
  if (!slug || !content.wishlist?.length) return undefined
  try {
    return await getClaimedItemIds(slug)
  } catch (error) {
    console.error("could not read the gift list claims", error instanceof Error ? error.message : error)
    return undefined
  }
}
