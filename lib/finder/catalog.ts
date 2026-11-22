// Majnu's own gift catalogue (issue #97, docs/features/gift-catalog.md): the
// active rows of gift_catalog (migration 0014), read with the service role and
// kept in memory per Worker for a few minutes, so the finder's first answer
// costs one small query every few minutes and no model call. The picking
// itself is pure (lib/finder/catalog-match.ts).
import "server-only"
import { describeError } from "@/lib/agents/errors"
import { createAdminClient } from "@/lib/supabase/admin"
import type { CatalogueGift } from "./catalog-match"

export const CATALOGUE_CACHE_MS = 5 * 60 * 1000
// More than the catalogue will hold for a while; one query reads it all.
const MAX_ROWS = 1000
const COLUMNS = "id, groups, occasions, interests, title, description, why, shop, price, price_eur, url, image_url"

let cache: { at: number; rows: CatalogueGift[] } | null = null
let loading: Promise<CatalogueGift[]> | null = null

async function readRows(): Promise<CatalogueGift[]> {
  const { data, error } = await createAdminClient()
    .from("gift_catalog")
    .select(COLUMNS)
    .eq("active", true)
    .limit(MAX_ROWS)
    .returns<CatalogueGift[]>()
  if (error) throw new Error(`Could not read the gift catalogue: ${error.message}`)
  return (data ?? []).map((row) => ({ ...row, price_eur: row.price_eur === null ? null : Number(row.price_eur) }))
}

// The active catalogue, from memory when it was read in the last few minutes.
// Never throws: when the table cannot be read, the finder falls back to
// asking first, as before the catalogue (an empty list), and a stale copy is
// better than none.
export async function loadCatalogue(now = Date.now()): Promise<CatalogueGift[]> {
  if (cache && now - cache.at < CATALOGUE_CACHE_MS) return cache.rows
  loading ??= readRows()
    .then((rows) => {
      cache = { at: Date.now(), rows }
      return rows
    })
    .catch((error) => {
      console.error("[finder] could not load the gift catalogue", describeError(error))
      return cache?.rows ?? []
    })
    .finally(() => {
      loading = null
    })
  return loading
}

// For tests: forget the cached rows.
export function clearCatalogueCache(): void {
  cache = null
  loading = null
}
