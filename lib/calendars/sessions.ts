// A calendar's finder session (issue #48). Each calendar made door by door has
// one row in finder_sessions (migration 0004), so no new table is needed:
//
// - `context` holds the finder's context for the person (country, language,
//   currency, relationship, age range, budget, interests), plus a server-only
//   `calendar` marker with the letter's id and what the sender told us, and the
//   finder's `profile` marker when a public profile was read for the pool;
// - `last_options` holds the pool of ideas, in the finder's StoredOptions
//   shape: `options` are GiftOptions, `recommendedId` is the idea suggested for
//   the last door ("" when there is none);
// - `chat` stays empty: a pool is one research run, not a conversation.
//
// As for every finder session, reads go through the signed-in user's client,
// so row-level security proves the calendar is theirs, and writes use the
// service-role client, because the pool is what the door route trusts.
import "server-only"
import * as z from "zod/v4"
import { resolveTimezone } from "@/lib/agents/context"
import type { FinderContext, GiftOption } from "@/lib/finder/events"
import { parseContext, parseOptions, parseProfile, storedContext, type ProfileRead, type StoredOptions } from "@/lib/finder/sessions"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { CalendarRelationshipKind } from "./types"

export type CalendarMarker = {
  letterId: string
  name: string
  kind: CalendarRelationshipKind
  // The age the sender typed, if any. The context's ageRange may be assumed.
  age?: number
  about?: string
  doorBudget: string
  lastDoorBudget?: string
  profileLink?: string
  // When Majnu wrote the door notes, ISO 8601 UTC, for the daily notes limit.
  notesRuns: string[]
}

export type CalendarSession = {
  id: string
  ownerId: string
  context: FinderContext
  marker: CalendarMarker
  timezone: string
  pool: StoredOptions | null
  profile: ProfileRead | null
  updatedAt: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNS = "id, owner_id, context, timezone, last_options, updated_at"
const KINDS = ["partner", "parent", "grandparent", "sibling", "friend", "child", "colleague", "other"] as const

type Row = { id: string; owner_id: string; context: unknown; timezone: string | null; last_options: unknown; updated_at: string }

const Marker = z.object({
  letterId: z.string(),
  name: z.string().catch(""),
  kind: z.enum(KINDS).catch("other"),
  age: z.number().int().min(0).max(120).optional().catch(undefined),
  about: z.string().optional().catch(undefined),
  doorBudget: z.string().catch(""),
  lastDoorBudget: z.string().optional().catch(undefined),
  profileLink: z.string().optional().catch(undefined),
  notesRuns: z.array(z.string()).catch([]),
})

export function parseMarker(context: unknown): CalendarMarker | null {
  if (!context || typeof context !== "object") return null
  const parsed = Marker.safeParse((context as { calendar?: unknown }).calendar)
  if (!parsed.success) return null
  return Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) as CalendarMarker
}

// The context column: the finder's context, the calendar marker and, if one
// was read, the profile marker.
export function calendarContext(context: FinderContext, marker: CalendarMarker, profile?: ProfileRead | null): Record<string, unknown> {
  return { ...storedContext(context, profile), calendar: marker }
}

function toSession(row: Row): CalendarSession | null {
  const marker = parseMarker(row.context)
  if (!marker) return null
  return {
    id: row.id,
    ownerId: row.owner_id,
    context: parseContext(row.context),
    marker,
    timezone: resolveTimezone(row.timezone),
    pool: parseOptions(row.last_options),
    profile: parseProfile(row.context),
    updatedAt: row.updated_at,
  }
}

// Called by the create route after getUser() has identified the owner.
export async function createCalendarSession(input: {
  ownerId: string
  context: FinderContext
  marker: CalendarMarker
  timezone: string
}): Promise<CalendarSession> {
  const { data, error } = await createAdminClient()
    .from("finder_sessions")
    .insert({ owner_id: input.ownerId, context: calendarContext(input.context, input.marker), timezone: input.timezone })
    .select(COLUMNS)
    .single<Row>()
  if (error) throw new Error(`Could not save the calendar's details: ${error.message}`)
  const session = toSession(data)
  if (!session) throw new Error("Could not save the calendar's details")
  return session
}

// The signed-in user's session for their calendar, or null (a calendar made in
// the letters chat has none, and so does someone else's).
export async function getMyCalendarSession(letterId: string): Promise<CalendarSession | null> {
  if (!UUID.test(letterId)) return null
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("finder_sessions")
    .select(COLUMNS)
    .eq("context->calendar->>letterId", letterId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Row>()
  if (error) throw new Error(`Could not load the calendar's ideas: ${error.message}`)
  return data ? toSession(data) : null
}

// Saves a pool and, after a profile read, the context with its interests. The
// owner check keeps a write from ever landing on another user's row.
export async function saveCalendarPool(
  session: Pick<CalendarSession, "id" | "ownerId" | "marker">,
  update: { pool: StoredOptions; context: FinderContext; profile: ProfileRead | null },
): Promise<void> {
  const { data, error } = await createAdminClient()
    .from("finder_sessions")
    .update({ last_options: update.pool, context: calendarContext(update.context, session.marker, update.profile) })
    .eq("id", session.id)
    .eq("owner_id", session.ownerId)
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`Could not save the calendar's ideas: ${error.message}`)
  if (!data) throw new Error("Calendar not found")
}

export function storedPool(options: GiftOption[], lastDoorId: string | null, why: string): StoredOptions {
  return { options, recommendedId: lastDoorId ?? "", why }
}

// ---------- The notes limit ----------

// Majnu's notes runs a user may start per UTC day, over all their calendars.
export const NOTES_PER_DAY = 4

export function notesRunsToday(markers: readonly Pick<CalendarMarker, "notesRuns">[], since: Date): number {
  const from = since.toISOString()
  return markers.reduce((sum, marker) => sum + marker.notesRuns.filter((at) => at >= from).length, 0)
}

async function myCalendarMarkers(ownerId: string): Promise<CalendarMarker[]> {
  const { data, error } = await createAdminClient()
    .from("finder_sessions")
    .select("context")
    .eq("owner_id", ownerId)
    .not("context->calendar", "is", null)
  if (error) throw new Error(`Could not count today's notes: ${error.message}`)
  return ((data ?? []) as { context: unknown }[]).map((row) => parseMarker(row.context)).filter((m): m is CalendarMarker => m !== null)
}

// Records one notes run on the calendar's session, unless the user has had
// NOTES_PER_DAY today. The write only lands if the row has not changed since it
// was read (updated_at), so two runs at once cannot both slip past the count.
// Returns the time recorded, to give it back if the run fails, or why not:
// `limit` (the day's runs are used up) or `changed` (load the session again).
export async function claimNotesRun(
  session: CalendarSession,
  now: Date,
  since: Date,
): Promise<{ ok: true; at: string } | { ok: false; reason: "limit" | "changed" }> {
  const markers = await myCalendarMarkers(session.ownerId)
  if (notesRunsToday(markers, since) >= NOTES_PER_DAY) return { ok: false, reason: "limit" }
  const at = now.toISOString()
  const marker: CalendarMarker = { ...session.marker, notesRuns: [...session.marker.notesRuns.filter((t) => t >= since.toISOString()), at] }
  const { data, error } = await createAdminClient()
    .from("finder_sessions")
    .update({ context: calendarContext(session.context, marker, session.profile) })
    .eq("id", session.id)
    .eq("owner_id", session.ownerId)
    .eq("updated_at", session.updatedAt)
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`Could not record the notes: ${error.message}`)
  if (!data) return { ok: false, reason: "changed" }
  return { ok: true, at }
}

// Gives a run back after the builder failed. Never throws.
export async function releaseNotesRun(session: Pick<CalendarSession, "id" | "ownerId">, at: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from("finder_sessions").select("context").eq("id", session.id).eq("owner_id", session.ownerId).maybeSingle<{ context: unknown }>()
    const marker = data ? parseMarker(data.context) : null
    if (!data || !marker) return
    const context = { ...(data.context as Record<string, unknown>), calendar: { ...marker, notesRuns: marker.notesRuns.filter((t) => t !== at) } }
    await admin.from("finder_sessions").update({ context }).eq("id", session.id).eq("owner_id", session.ownerId)
  } catch (error) {
    console.error("[calendars] could not give back a notes run", { message: error instanceof Error ? error.message : String(error) })
  }
}
