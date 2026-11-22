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
//
// Files the visitor shares (issue #77) are counted the same way, as
// `uploads: { v, total, day, today }` in the context: files read in the
// session ever, and on `day` (UTC). Their notes are visitor-facing
// (FinderContext.notes); the files themselves are never stored.
//
// Every write of the context column goes through writeContext(): it reads the
// row, builds the new context from what is there, and writes it only if the
// context's revision (`rev`) has not moved since, retrying otherwise. So a
// turn saved from a stale copy can never wipe a file claim or a profile read
// another request made in the meantime.
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
  notes: z.array(z.string()).optional().catch(undefined),
})

// The visitor-facing keys of the context column. Everything else in it is a
// server-only marker (profile, uploads, a calendar's marker) or the revision.
const VISITOR_KEYS = new Set(Object.keys(StoredContext.shape))

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
  source: z.enum(["instagram", "tiktok", "linkedin", "web"]),
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

// ---------- Writing the context column ----------

type RawContext = Record<string, unknown>

const MAX_WRITE_ATTEMPTS = 4

export class ContextConflictError extends Error {
  constructor() {
    super("The finder session kept changing while it was saved")
    this.name = "ContextConflictError"
  }
}

function asRecord(value: unknown): RawContext {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as RawContext) } : {}
}

// The server-only markers of a stored context, without the revision.
export function serverMarkers(raw: RawContext): RawContext {
  return Object.fromEntries(Object.entries(raw).filter(([key]) => !VISITOR_KEYS.has(key) && key !== "rev"))
}

function revisionOf(raw: RawContext): number | null {
  return typeof raw.rev === "number" && Number.isInteger(raw.rev) && raw.rev >= 0 ? raw.rev : null
}

// Reads the session's context, builds the next one from it, and writes it
// (with `extra` columns) only if no other write came in between. `build`
// returns null to write nothing. Returns what was written, or null.
export async function writeContext(
  session: Pick<FinderSession, "id" | "ownerId">,
  build: (current: RawContext) => RawContext | null,
  extra: Record<string, unknown> = {},
): Promise<RawContext | null> {
  const admin = createAdminClient()
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const read = await admin
      .from("finder_sessions")
      .select("context")
      .eq("id", session.id)
      .eq("owner_id", session.ownerId)
      .maybeSingle<{ context: unknown }>()
    if (read.error) throw new Error(`Could not load the finder session: ${read.error.message}`)
    if (!read.data) throw new Error("Finder session not found")
    const current = asRecord(read.data.context)
    const next = build(current)
    if (!next) return null
    const rev = revisionOf(current)
    const { rev: _ignored, ...body } = next
    void _ignored
    const written = { ...body, rev: (rev ?? 0) + 1 }
    let update = admin.from("finder_sessions").update({ ...extra, context: written }).eq("id", session.id).eq("owner_id", session.ownerId)
    update = rev === null ? update.is("context->rev", null) : update.eq("context->>rev", String(rev))
    const { data, error } = await update.select("id").maybeSingle()
    if (error) throw new Error(`Could not save the finder session: ${error.message}`)
    if (data) return written
  }
  throw new ContextConflictError()
}

// Saves a turn. `chat` must be what was loaded with this turn's messages
// appended; the owner check keeps a write from ever landing on another user's
// row. The visitor-facing context is the turn's; the server-only markers are
// the row's own, except the profile read this turn made.
export async function saveFinderSession(
  session: Pick<FinderSession, "id" | "ownerId">,
  update: { chat: BetaMessageParam[]; context: FinderContext; lastOptions: StoredOptions | null; profile?: ProfileRead | null },
): Promise<void> {
  await writeContext(
    session,
    (current) => ({ ...serverMarkers(current), ...update.context, ...(update.profile ? { profile: update.profile } : {}) }),
    { chat: update.chat, last_options: update.lastOptions },
  )
}

// ---------- Public profile reads (issue #34) ----------

// Records a profile read on the session, unless one is already recorded. The
// write is conditional on the revision it read, and on there being no profile
// yet, so two messages at the same moment cannot both read a profile. False
// when the session already has one.
export async function markProfileRead(
  session: Pick<FinderSession, "id" | "ownerId">,
  context: FinderContext,
  profile: ProfileRead,
): Promise<boolean> {
  const written = await writeContext(session, (current) =>
    current.profile ? null : { ...serverMarkers(current), ...context, profile },
  )
  return written !== null
}

// Takes a recorded read back (it was over the daily cap). Never throws; a
// marker left behind only means this session cannot read a profile.
export async function clearProfileRead(session: Pick<FinderSession, "id" | "ownerId">, context: FinderContext): Promise<void> {
  try {
    await writeContext(session, (current) => {
      const { profile: _profile, ...markers } = serverMarkers(current)
      void _profile
      return { ...markers, ...context }
    })
  } catch (error) {
    console.error("[finder] could not clear a profile read", { message: error instanceof Error ? error.message : String(error) })
  }
}

// ---------- Files the visitor shares (issue #77) ----------

// `v` goes up with every change, `total` counts the session's files ever,
// `today` those of `day` (YYYY-MM-DD, UTC).
export type UploadsRecord = { v: number; total: number; day: string; today: number }

const StoredUploads = z.object({
  v: z.number().int().min(0),
  total: z.number().int().min(0),
  day: z.string(),
  today: z.number().int().min(0),
})

export function parseUploads(context: unknown): UploadsRecord | null {
  if (!context || typeof context !== "object") return null
  const parsed = StoredUploads.safeParse((context as { uploads?: unknown }).uploads)
  return parsed.success ? parsed.data : null
}

export const utcDay = (now: Date) => now.toISOString().slice(0, 10)

// Files read today (UTC) by this user over all their sessions, and on the
// whole site. Rows are the sessions that read a file today: a few per user,
// a few hundred at most for the site.
export async function countFileReadsToday(ownerId: string, now: Date): Promise<{ visitor: number; site: number }> {
  const admin = createAdminClient()
  const day = utcDay(now)
  const [mine, site] = await Promise.all([
    admin.from("finder_sessions").select("uploads:context->uploads").eq("owner_id", ownerId).eq("context->uploads->>day", day),
    admin.from("finder_sessions").select("uploads:context->uploads").eq("context->uploads->>day", day),
  ])
  if (mine.error) throw new Error(`Could not count today's files: ${mine.error.message}`)
  if (site.error) throw new Error(`Could not count today's files: ${site.error.message}`)
  const sum = (rows: unknown) =>
    (Array.isArray(rows) ? rows : []).reduce((total: number, row) => {
      const uploads = parseUploads(row)
      return total + (uploads && uploads.day === day ? uploads.today : 0)
    }, 0)
  return { visitor: sum(mine.data), site: sum(site.data) }
}

// Changes the session's file counts with `change`, from what the row holds
// now. `change` returns null to leave them alone (a refusal), or the counts
// to write; a calendar's session never takes files. Returns what was written.
export async function changeUploads(
  session: Pick<FinderSession, "id" | "ownerId">,
  change: (uploads: UploadsRecord | null, current: RawContext) => Omit<UploadsRecord, "v"> | null,
): Promise<UploadsRecord | null> {
  let result: UploadsRecord | null = null
  await writeContext(session, (current) => {
    if (current.calendar) return null
    const uploads = parseUploads(current)
    const next = change(uploads, current)
    if (!next) return null
    result = { ...next, v: (uploads?.v ?? 0) + 1 }
    return { ...current, uploads: result }
  })
  return result
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
