// Reading and writing letters. Signatures are part of the contract.
//
// - Public reads (getPublicLetter) use the service-role client and look up by
//   exact slug: there is no anonymous read policy.
// - Owner reads and content writes use the signed-in user's client, so
//   row-level security enforces ownership.
// - Inserts (createLetter) and the stored chat (saveChat) are written with the
//   service-role client after the session or an RLS read has proved ownership:
//   the slug, owner and chat are never values the browser can set.
//
// Owner functions throw when there is no session or a query fails. Reads that
// find nothing return null (getMyLetter) or an empty list (listMyLetters).
import "server-only"
import * as z from "zod/v4"
import { canCreateLetter } from "@/lib/limits"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { calendarFixtures, demoSlugs, letterFixtures } from "./fixtures"
import { toPublicView } from "./public-view"
import {
  CalendarContent,
  CalendarTemplateId,
  LetterContent,
  LetterTemplateId,
  TemplateId,
  type LetterKind,
  type LetterRecord,
  type PublicLetter,
} from "./schema"

export { toPublicView } from "./public-view"

// ---------- Rows ----------

const LETTER_COLUMNS = "id, owner_id, slug, kind, template_id, title, content, created_at, updated_at"

type LetterRow = {
  id: string
  owner_id: string
  slug: string
  kind: string
  template_id: string | null
  title: string | null
  content: unknown
  created_at: string
  updated_at: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG = /^[A-Za-z0-9_-]{6,64}$/
const MAX_TITLE = 200

// Content is passed through as stored; toPublicView and getMyLetter validate it.
function toRecord(row: LetterRow): LetterRecord {
  const templateId = TemplateId.safeParse(row.template_id)
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    kind: row.kind === "calendar" ? "calendar" : "letter",
    templateId: templateId.success ? templateId.data : null,
    title: row.title,
    content: row.content as LetterRecord["content"],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function parseContent(kind: LetterKind, content: unknown): LetterContent | CalendarContent | null {
  if (content === null || content === undefined) return null
  const parsed = kind === "calendar" ? CalendarContent.safeParse(content) : LetterContent.safeParse(content)
  return parsed.success ? parsed.data : null
}

// ---------- Public side (Dev B's seam) ----------

// The letter behind a public link, render-ready, with locked doors removed.
// Returns null for unknown slugs and for letters that have no content yet.
export async function getPublicLetter(slug: string, now: Date = new Date()): Promise<PublicLetter | null> {
  if (Object.hasOwn(demoSlugs, slug)) {
    const demo = demoSlugs[slug as keyof typeof demoSlugs]
    const content = demo.kind === "letter" ? letterFixtures[demo.templateId] : calendarFixtures[demo.templateId]
    const record: LetterRecord = {
      id: slug,
      ownerId: "demo",
      slug,
      kind: demo.kind,
      templateId: demo.templateId,
      title: null,
      content,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    return toPublicView(record, now, { ownerPreview: false })
  }

  if (!SLUG.test(slug)) return null
  const admin = createAdminClient()
  // Never select `chat` here: it is private and can be large.
  const { data, error } = await admin.from("letters").select(LETTER_COLUMNS).eq("slug", slug).maybeSingle<LetterRow>()
  if (error) throw new Error(`Could not load the letter: ${error.message}`)
  if (!data) return null
  return toPublicView(toRecord(data), now, { ownerPreview: false })
}

// ---------- Owner side (the signed-in user's own letters) ----------

export type LetterStats = {
  firstOpenedAt: string | null
  lastOpenedAt: string | null
  totalOpens: number
  uniqueVisitors: number
}

export type LetterSummary = {
  id: string
  slug: string
  kind: LetterKind
  templateId: TemplateId | null
  title: string | null
  recipientName: string | null
  hasContent: boolean
  createdAt: string
  updatedAt: string
  stats: LetterStats
}

export type OwnedLetter = LetterRecord & {
  // The conversation exactly as the Anthropic API returned it, replayed append-only.
  chat: unknown[]
}

// Creates an empty letter for the signed-in user (slug and owner set on the server).
// Throws if there is no session or the daily letter limit is reached; routes
// should call canCreateLetter() first to show its friendly message.
export async function createLetter(): Promise<{ id: string; slug: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error("Not signed in")

  // A backstop for the spending guard, in case a route forgets to check first.
  const limit = await canCreateLetter()
  if (!limit.ok) throw new Error(limit.message)

  const admin = createAdminClient()
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug()
    const { data, error } = await admin
      .from("letters")
      .insert({ owner_id: user.id, slug })
      .select("id, slug")
      .single<{ id: string; slug: string }>()
    if (!error) return { id: data.id, slug: data.slug }
    // 23505: unique violation, i.e. the slug is taken. Try another.
    if (error.code !== "23505") throw new Error(`Could not create the letter: ${error.message}`)
  }
  throw new Error("Could not create the letter: no free link after 5 tries")
}

// The signed-in user's letter, or null if it does not exist or belongs to someone else.
export async function getMyLetter(id: string): Promise<OwnedLetter | null> {
  if (!UUID.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("letters")
    .select(`${LETTER_COLUMNS}, chat`)
    .eq("id", id)
    .maybeSingle<LetterRow & { chat: unknown }>()
  if (error) throw new Error(`Could not load the letter: ${error.message}`)
  if (!data) return null
  const record = toRecord(data)
  return {
    ...record,
    content: parseContent(record.kind, data.content),
    chat: Array.isArray(data.chat) ? data.chat : [],
  }
}

type SummaryRow = {
  id: string
  slug: string
  kind: string
  template_id: string | null
  title: string | null
  recipient_name: string | null
  has_content: boolean
  created_at: string
  updated_at: string
  first_opened_at: string | null
  last_opened_at: string | null
  total_opens: number | string
  unique_visitors: number | string
}

// The signed-in user's letters, newest first, with open statistics.
// Stats come from letter_events, which keeps one row per visitor and event
// (and per door for calendars): totalOpens counts visitors who opened the
// letter, and lastOpenedAt is the latest event of any kind.
export async function listMyLetters(): Promise<LetterSummary[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("letter_summaries")
    .select(
      "id, slug, kind, template_id, title, recipient_name, has_content, created_at, updated_at, first_opened_at, last_opened_at, total_opens, unique_visitors",
    )
    .order("created_at", { ascending: false })
    .returns<SummaryRow[]>()
  if (error) throw new Error(`Could not load your letters: ${error.message}`)
  return (data ?? []).map((row) => {
    const templateId = TemplateId.safeParse(row.template_id)
    return {
      id: row.id,
      slug: row.slug,
      kind: row.kind === "calendar" ? "calendar" : "letter",
      templateId: templateId.success ? templateId.data : null,
      title: row.title,
      recipientName: row.recipient_name,
      hasContent: row.has_content,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      stats: {
        firstOpenedAt: row.first_opened_at,
        lastOpenedAt: row.last_opened_at,
        totalOpens: Number(row.total_opens),
        uniqueVisitors: Number(row.unique_visitors),
      },
    }
  })
}

// Saves what the builder produced. Validates `content` against the schema for `kind`.
// Throws on invalid content, a template of the other kind, or a letter the user does not own.
export async function saveLetterContent(
  id: string,
  input: { kind: LetterKind; templateId: TemplateId; title: string; content: LetterContent | CalendarContent },
): Promise<void> {
  const valid = validateContent(input)
  if (!UUID.test(id)) throw new Error("Letter not found")
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("letters")
    .update({
      kind: input.kind,
      template_id: valid.templateId,
      title: input.title.trim().slice(0, MAX_TITLE) || null,
      content: valid.content,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`Could not save the letter: ${error.message}`)
  if (!data) throw new Error("Letter not found")
}

function validateContent(input: { kind: LetterKind; templateId: TemplateId; content: unknown }): {
  templateId: TemplateId
  content: LetterContent | CalendarContent
} {
  const templateId = input.kind === "calendar" ? CalendarTemplateId.safeParse(input.templateId) : LetterTemplateId.safeParse(input.templateId)
  if (!templateId.success) throw new Error(`Template "${input.templateId}" is not a ${input.kind} template`)
  const content = input.kind === "calendar" ? CalendarContent.safeParse(input.content) : LetterContent.safeParse(input.content)
  if (!content.success) throw new Error(`The ${input.kind} content is not valid:\n${z.prettifyError(content.error)}`)
  return { templateId: templateId.data, content: content.data }
}

// Replaces the stored conversation. Callers only ever append to what they loaded.
// Ownership is checked through RLS first; the write itself uses the service
// role because the browser is not allowed to change `chat` (see the migration).
export async function saveChat(id: string, chat: unknown[]): Promise<void> {
  if (!Array.isArray(chat)) throw new Error("The chat must be an array of messages")
  if (!UUID.test(id)) throw new Error("Letter not found")
  const supabase = await createClient()
  const { data: owned, error } = await supabase
    .from("letters")
    .select("id, owner_id")
    .eq("id", id)
    .maybeSingle<{ id: string; owner_id: string }>()
  if (error) throw new Error(`Could not save the chat: ${error.message}`)
  if (!owned) throw new Error("Letter not found")

  const admin = createAdminClient()
  const { data, error: updateError } = await admin
    .from("letters")
    .update({ chat })
    .eq("id", owned.id)
    .eq("owner_id", owned.owner_id)
    .select("id")
    .maybeSingle()
  if (updateError) throw new Error(`Could not save the chat: ${updateError.message}`)
  if (!data) throw new Error("Letter not found")
}

export type Profile = { plan: "free" | "full-moon"; planRenewsAt: string | null }

// The signed-in user's plan. Users without a profile row count as free.
export async function getMyProfile(): Promise<Profile> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("profiles")
    .select("plan, plan_renews_at")
    .maybeSingle<{ plan: string; plan_renews_at: string | null }>()
  if (error) throw new Error(`Could not load your plan: ${error.message}`)
  if (!data) return { plan: "free", planRenewsAt: null }
  return { plan: data.plan === "full-moon" ? "full-moon" : "free", planRenewsAt: data.plan_renews_at }
}

// ---------- Slugs ----------

// URL-safe and without look-alike characters (no 0/O/o, 1/l/I, 2/Z, 5/S/s, u/v),
// so a link read aloud or typed from a QR code still works.
const SLUG_ALPHABET = "346789ABCDEFGHJKLMNPQRTUVWXYabcdefghijkmnpqrtwxyz"
const SLUG_LENGTH = 10

// 10 characters from 49 is about 56 bits. Rejection sampling keeps every
// character equally likely.
function generateSlug(): string {
  const limit = 256 - (256 % SLUG_ALPHABET.length)
  let slug = ""
  while (slug.length < SLUG_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(SLUG_LENGTH * 2))) {
      if (byte < limit && slug.length < SLUG_LENGTH) slug += SLUG_ALPHABET[byte % SLUG_ALPHABET.length]
    }
  }
  return slug
}
