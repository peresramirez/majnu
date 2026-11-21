// Records one open-tracking event for POST /api/open.
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { demoSlugs } from "@/lib/letters/fixtures"
import { toPublicView } from "@/lib/letters/public-view"
import { TemplateId, type LetterKind } from "@/lib/letters/schema"
import { isCrawler, NO_DETAILS, type OpenDetails } from "./details"
import { trackedDay, type OpenEventType } from "./rules"
import { visitorId } from "./visitor"

const SLUG = /^[A-Za-z0-9_-]{6,64}$/
const MAX_USER_AGENT = 512

export type OpenEvent = {
  slug: string
  type: OpenEventType
  day?: number
  ip: string
  userAgent: string
  // Place, language and device (lib/open/details.ts). Never the IP address.
  details?: OpenDetails
  now?: Date
}

// Returns quietly in every case the caller should not learn about: unknown
// slugs, demo slugs, letters without content, doors that are still locked,
// and crawlers.
export async function recordOpenEvent(event: OpenEvent): Promise<void> {
  if (!SLUG.test(event.slug) || event.slug in demoSlugs) return
  // A link-preview service or bot that ran the beacon is not a visitor.
  if (isCrawler(event.userAgent)) return

  const secret = process.env.OPEN_HASH_SECRET
  if (!secret) {
    console.warn("open tracking is off: OPEN_HASH_SECRET is not set")
    return
  }

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from("letters")
    .select("id, owner_id, slug, kind, template_id, title, content, created_at, updated_at")
    .eq("slug", event.slug)
    .maybeSingle()
  if (error) throw new Error(`Could not look up the letter for open tracking: ${error.message}`)
  if (!row) return

  const templateId = TemplateId.safeParse(row.template_id)
  const view = toPublicView(
    {
      id: row.id,
      ownerId: row.owner_id,
      slug: row.slug,
      kind: row.kind as LetterKind,
      templateId: templateId.success ? templateId.data : null,
      title: row.title,
      content: row.content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
    event.now ?? new Date(),
    { ownerPreview: false },
  )
  if (!view) return

  const day = trackedDay(view, event.type, event.day)
  if (day === null) return

  const userAgent = event.userAgent.slice(0, MAX_USER_AGENT)
  const { country, city, language, device } = event.details ?? NO_DETAILS
  const { error: insertError } = await admin.from("letter_events").upsert(
    {
      letter_id: row.id,
      type: event.type,
      day,
      visitor_id: await visitorId({ letterId: row.id, ip: event.ip, userAgent, secret }),
      user_agent: userAgent || null,
      country,
      city,
      language,
      device,
    },
    // ON CONFLICT DO NOTHING: a repeat visit does not add a row.
    { onConflict: "letter_id,type,day,visitor_id", ignoreDuplicates: true },
  )
  if (insertError) throw new Error(`Could not record the open event: ${insertError.message}`)
}
