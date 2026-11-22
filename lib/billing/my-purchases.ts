// The signed-in owner's own purchases, read through row-level security with
// an explicit column list (failure_reason is not granted to owners, so
// "select *" would fail). Kept apart from ./purchases.ts, whose service-role
// writes the queue consumer uses: this file loads the cookie-based client.
import "server-only"
import { createClient } from "@/lib/supabase/server"
import { COLUMNS, toPurchase, type Purchase, type Row } from "./purchases"

// What the owner sees: the purchase and the gift it is for.
export type OwnPurchase = Purchase & { letter: { slug: string; title: string | null } | null }

type OwnRow = Row & { letter: { slug: string; title: string | null } | null }

const OWN_COLUMNS = `${COLUMNS}, letter:letters (slug, title)`

function toOwnPurchase(row: OwnRow): OwnPurchase {
  return { ...toPurchase(row), letter: row.letter ?? null }
}

// The Purchases tab: everything that was paid for, newest first. Pending rows
// are Checkouts that were opened and never paid; they are not purchases.
export async function listMyPurchases(): Promise<OwnPurchase[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("purchases")
    .select(OWN_COLUMNS)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<OwnRow[]>()
  if (error) throw new Error(`Could not load your purchases: ${error.message}`)
  return (data ?? []).map(toOwnPurchase)
}

export async function getMyPurchase(purchaseId: string): Promise<OwnPurchase | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("purchases").select(OWN_COLUMNS).eq("id", purchaseId).maybeSingle<OwnRow>()
  if (error) throw new Error(`Could not load the purchase: ${error.message}`)
  return data ? toOwnPurchase(data) : null
}

// The newest paid purchase of one of the owner's letters, for the letter's
// preview: is a design being made, or ready?
export async function getMyLatestPurchaseForLetter(letterId: string): Promise<OwnPurchase | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("purchases")
    .select(OWN_COLUMNS)
    .eq("letter_id", letterId)
    .neq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<OwnRow>()
  if (error) throw new Error(`Could not load the letter's purchases: ${error.message}`)
  return data ? toOwnPurchase(data) : null
}

// ---------- The letter a wrapper is bought for ----------

export type WrapperLetter = { id: string; slug: string; kind: string; built: boolean }

// The signed-in user's own letter, read through row-level security, so a
// letter id that belongs to someone else is simply not found.
export async function getMyLetterForWrapper(letterId: string): Promise<WrapperLetter | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("letters")
    .select("id, slug, kind, content")
    .eq("id", letterId)
    .maybeSingle<{ id: string; slug: string; kind: string; content: unknown }>()
  if (error) throw new Error(`Could not load the letter: ${error.message}`)
  if (!data) return null
  return { id: data.id, slug: data.slug, kind: data.kind, built: data.content !== null && typeof data.content === "object" }
}
