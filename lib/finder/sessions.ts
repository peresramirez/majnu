// Finder sessions (migration 0004): one conversation with the finder, with the
// context it assumed, the conversation as the Anthropic API returned it, and
// the last options shown.
//
// Reads use the signed-in user's client, so row-level security proves the
// session is theirs. Writes use the service-role client: the browser can never
// change a session, because its conversation is replayed to the model and its
// options are what the wrap route trusts.
import "server-only"
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import * as z from "zod/v4"
import { resolveTimezone } from "@/lib/agents/context"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import type { FinderContext, GiftOption } from "./events"
import { DEFAULT_LANGUAGE } from "./context"

export type StoredOptions = { options: GiftOption[]; recommendedId: string; why: string }

export type FinderSession = {
  id: string
  ownerId: string
  context: FinderContext
  timezone: string
  // Exactly as the API returned it; replayed append-only.
  chat: BetaMessageParam[]
  lastOptions: StoredOptions | null
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

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export function parseContext(value: unknown): FinderContext {
  const parsed = StoredContext.safeParse(value ?? {})
  return parsed.success ? withoutUndefined(parsed.data) : { language: DEFAULT_LANGUAGE }
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

// Saves a turn. `chat` must be what was loaded with this turn's messages
// appended; the owner check keeps a write from ever landing on another user's row.
export async function saveFinderSession(
  session: Pick<FinderSession, "id" | "ownerId">,
  update: { chat: BetaMessageParam[]; context: FinderContext; lastOptions: StoredOptions | null },
): Promise<void> {
  const { data, error } = await createAdminClient()
    .from("finder_sessions")
    .update({ chat: update.chat, context: update.context, last_options: update.lastOptions })
    .eq("id", session.id)
    .eq("owner_id", session.ownerId)
    .select("id")
    .maybeSingle()
  if (error) throw new Error(`Could not save the finder session: ${error.message}`)
  if (!data) throw new Error("Finder session not found")
}
