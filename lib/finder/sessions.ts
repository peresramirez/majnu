// Finder sessions (migration 0004): one conversation with the finder, with the
// context it assumed, the conversation as the Anthropic API returned it, and
// the last options shown.
//
// Reads use the signed-in user's client, so row-level security proves the
// session is theirs. Writes use the service-role client: the browser can never
// change a session, because its conversation is replayed to the model and its
// options are what the wrap route trusts.
//
// A public profile read for the session (issue #34) is recorded inside the
// `context` column as `profile: { source, readAt, interests }`, so the limits
// (one read per session, APIFY_DAILY_CAP a day) need no table of their own.
// It is server-only: parseContext() leaves it out, so the browser never sees
// it. Only the interests are kept, never what was read.
import "server-only"
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import * as z from "zod/v4"
import { resolveTimezone } from "@/lib/agents/context"
import { startOfUtcDay } from "@/lib/limits"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { ProfileSource } from "@/lib/social/links"
import type { FinderContext, GiftOption } from "./events"
import { DEFAULT_LANGUAGE } from "./context"

export type StoredOptions = { options: GiftOption[]; recommendedId: string; why: string }

// The one public profile or page read in a session: where from, when (ISO
// 8601, UTC), and the interests it gave. A read that failed has no interests
// but still counts.
export type ProfileRead = { source: ProfileSource; readAt: string; interests: string[] }

export type FinderSession = {
  id: string
  ownerId: string
  context: FinderContext
  timezone: string
  // Exactly as the API returned it; replayed append-only.
  chat: BetaMessageParam[]
  lastOptions: StoredOptions | null
  profile: ProfileRead | null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUMNS = "id, owner_id, context, timezone, chat, last_options"

type SessionRow = {
  id: string
  owner_id: string
  context: unknown
  timezone: string | null
  chat: unknown
  last_options: unknown
}

// What is read back is checked, so a row written by an older version of this
// code cannot break a session.
const StoredContext = z.object({
  country: z.string().optional().catch(undefined),
  region: z.string().optional().catch(undefined),
  language: z.string().catch(DEFAULT_LANGUAGE),
  currency: z.string().optional().catch(undefined),
  relationship: z.string().optional().catch(undefined),
  ageRange: z.tuple([z.number(), z.number()]).optional().catch(undefined),
  budget: z.string().optional().catch(undefined),
  interests: z.array(z.string()).optional().catch(undefined),
  occasion: z.string().optional().catch(undefined),
  name: z.string().optional().catch(undefined),
})

const StoredOption = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  reason: z.string(),
  price: z.string().optional(),
  url: z.string(),
  imageUrl: z.string().optional(),
  shop: z.string().optional(),
})

const StoredOptionsSchema = z.object({
  options: z.array(StoredOption),
  recommendedId: z.string(),
  why: z.string(),
})

const StoredProfile = z.object({
  source: z.enum(["instagram", "tiktok", "web"]),
  readAt: z.string(),
  interests: z
    .array(z.string())
    .transform((items) => items.slice(0, 6))
    .catch([]),
})

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export function parseContext(value: unknown): FinderContext {
  const parsed = StoredContext.safeParse(value ?? {})
  return parsed.success ? withoutUndefined(parsed.data) : { language: DEFAULT_LANGUAGE }
}

export function parseProfile(context: unknown): ProfileRead | null {
  if (!context || typeof context !== "object") return null
  const parsed = StoredProfile.safeParse((context as { profile?: unknown }).profile)
  return parsed.success ? parsed.data : null
}

// What goes into the context column: the visitor-facing context plus the
// server-only profile marker.
export function storedContext(context: FinderContext, profile: ProfileRead | null | undefined): Record<string, unknown> {
  return profile ? { ...context, profile } : { ...context }
}

export function parseOptions(value: unknown): StoredOptions | null {
  if (value === null || value === undefined) return null
  const parsed = StoredOptionsSchema.safeParse(value)
  return parsed.success ? { ...parsed.data, options: parsed.data.options.map(withoutUndefined) } : null
}

function toSession(row: SessionRow): FinderSession {
  return {
    id: row.id,
    ownerId: row.owner_id,
    context: parseContext(row.context),
    timezone: resolveTimezone(row.timezone),
    chat: Array.isArray(row.chat) ? (row.chat as BetaMessageParam[]) : [],
    lastOptions: parseOptions(row.last_options),
    profile: parseProfile(row.context),
  }
}

// A new, empty session for a user the route has identified with getUser().
export async function createFinderSession(ownerId: string, context: FinderContext, timezone: string): Promise<FinderSession> {
  const { data, error } = await createAdminClient()
    .from("finder_sessions")
    .insert({ owner_id: ownerId, context, timezone })
    .select(COLUMNS)
    .single<SessionRow>()
  if (error) throw new Error(`Could not start the finder session: ${error.message}`)
  return toSession(data)
}

// The signed-in user's session, or null if it does not exist or is someone else's.
export async function getMyFinderSession(id: string): Promise<FinderSession | null> {
  if (!UUID.test(id)) return null
  const supabase = await createClient()
  const { data, error } = await supabase.from("finder_sessions").select(COLUMNS).eq("id", id).maybeSingle<SessionRow>()
  if (error) throw new Error(`Could not load the finder session: ${error.message}`)
  return data ? toSession(data) : null
}

// The signed-in user's finder sessions started today (UTC), newest first, for
// continuing an open one (findOpenSession in limits.ts). Calendar sessions
// (lib/calendars/sessions.ts) are left out: they belong to their calendar.
export async function listTodaysFinderSessions(ownerId: string, now: Date, max = 3): Promise<FinderSession[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("finder_sessions")
    .select(COLUMNS)
    .eq("owner_id", ownerId)
    .gte("created_at", startOfUtcDay(now).toISOString())
    .is("context->calendar", null)
    .order("created_at", { ascending: false })
    .limit(max)
    .returns<SessionRow[]>()
  if (error) throw new Error(`Could not load today's finder sessions: ${error.message}`)
  return (data ?? []).map(toSession)
}

// Saves a turn. `chat` must be what was loaded with this turn's messages
// appended; the owner check keeps a write from ever landing on another user's row.
export async function saveFinderSession(
  session: Pick<FinderSession, "id" | "ownerId">,
  update: { chat: BetaMessageParam[]; context: FinderContext; lastOptions: StoredOptions | null; profile?: ProfileRead | null },
): Promise<void> {
  const { data, error } = await createAdminClient()
    .from("finder_sessions")
    .update({ chat: update.chat, context: storedContext(update.context, update.profile), last_options: update.lastOptions })
    .eq("id", session.id)
    .eq("owner_id", session.ownerId)
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`Could not save the finder session: ${error.message}`)
  if (!data) throw new Error("Finder session not found")
}

// ---------- Public profile reads (issue #34) ----------

// Records a profile read on the session, unless one is already recorded. The
// check and the write are one UPDATE, so two messages at the same moment
// cannot both read a profile. False when the session already has one.
export async function markProfileRead(
  session: Pick<FinderSession, "id" | "ownerId">,
  context: FinderContext,
  profile: ProfileRead,
): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("finder_sessions")
    .update({ context: storedContext(context, profile) })
    .eq("id", session.id)
    .eq("owner_id", session.ownerId)
    .is("context->profile", null)
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`Could not record the profile read: ${error.message}`)
  return Boolean(data)
}

// Takes a recorded read back (it was over the daily cap). Never throws; a
// marker left behind only means this session cannot read a profile.
export async function clearProfileRead(session: Pick<FinderSession, "id" | "ownerId">, context: FinderContext): Promise<void> {
  try {
    const { error } = await createAdminClient()
      .from("finder_sessions")
      .update({ context: storedContext(context, null) })
      .eq("id", session.id)
      .eq("owner_id", session.ownerId)
    if (error) console.error("[finder] could not clear a profile read", { message: error.message })
  } catch (error) {
    console.error("[finder] could not clear a profile read", { message: error instanceof Error ? error.message : String(error) })
  }
}

// Profile reads from these sources recorded on any session since `since`.
// readAt is always written by toISOString(), so comparing the text compares the time.
export async function countProfileReadsSince(since: Date, sources: readonly ProfileSource[]): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("finder_sessions")
    .select("id", { count: "exact", head: true })
    .gte("context->profile->>readAt", since.toISOString())
    .in("context->profile->>source", [...sources])
  if (error) throw new Error(`Could not count today's profile reads: ${error.message}`)
  return count ?? 0
}
