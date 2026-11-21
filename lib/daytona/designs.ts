// Reading stored designs and the headers they are served with. Used by
// /l/<slug>/design; it never imports the Daytona SDK, so the public route
// stays small and has nothing to do with sandboxes.
//
// A design is HTML that a sender influenced, served from our own domain, so the
// response header is the security boundary (docs/plan.md, "Daytona redesign"):
// - `sandbox allow-scripts` gives the document an opaque origin: its scripts
//   run, but cannot read our cookies or storage, or script the page around it.
//   `allow-popups` and `allow-popups-to-escape-sandbox` let a gift link
//   (target="_blank") open the shop in a normal tab.
// - `default-src 'none'` with inline styles, inline scripts and data: images
//   and fonts only: the browser makes no request for the page, whatever the
//   HTML tries. `base-uri` and `form-action` are not covered by default-src,
//   so they are closed separately.
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"

export const DESIGN_CSP = [
  "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox",
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "img-src data:",
  "font-src data:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ")

export const DESIGN_HEADERS: Record<string, string> = {
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy": DESIGN_CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  // A newer design replaces the old one at the same URL, so nothing caches it.
  "Cache-Control": "private, no-store",
}

const SLUG = /^[A-Za-z0-9_-]{6,64}$/

export type StoredDesign = { id: string; html: string; createdAt: string }
export type DesignInfo = { id: string; createdAt: string }

type Admin = ReturnType<typeof createAdminClient>

// Looked up by exact slug with the service-role client, like the letter page:
// there is no anonymous read policy.
async function letterIdForSlug(admin: Admin, slug: string): Promise<string | null> {
  if (!SLUG.test(slug)) return null
  const { data, error } = await admin.from("letters").select("id").eq("slug", slug).maybeSingle<{ id: string }>()
  if (error) throw new Error(`Could not load the letter: ${error.message}`)
  return data?.id ?? null
}

async function newestDesign<T>(admin: Admin, letterId: string, columns: string): Promise<T | null> {
  const { data, error } = await admin
    .from("letter_designs")
    .select(columns)
    .eq("letter_id", letterId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<T>()
  if (error) throw new Error(`Could not load the design: ${error.message}`)
  return data
}

// The newest design of the letter behind a public link, or null when the slug
// is unknown or the letter has none.
export async function getLatestDesign(slug: string): Promise<StoredDesign | null> {
  const admin = createAdminClient()
  const letterId = await letterIdForSlug(admin, slug)
  if (!letterId) return null
  const row = await newestDesign<{ id: string; html: string; created_at: string }>(admin, letterId, "id, html, created_at")
  return row ? { id: row.id, html: row.html, createdAt: row.created_at } : null
}

// Whether the letter behind a public link has a design, and when the newest
// was made, without loading the HTML: what /l/<slug> needs to choose between
// its template and an iframe of /l/<slug>/design.
export async function getLatestDesignInfo(slug: string): Promise<DesignInfo | null> {
  const admin = createAdminClient()
  const letterId = await letterIdForSlug(admin, slug)
  if (!letterId) return null
  const row = await newestDesign<{ id: string; created_at: string }>(admin, letterId, "id, created_at")
  return row ? { id: row.id, createdAt: row.created_at } : null
}
