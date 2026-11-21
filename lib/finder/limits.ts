// The gift finder's share of the spending guard (docs/plan.md, "Accounts and
// limits"). Per user and UTC day: 3 searches in total, at most 2 of them
// personalised. Site-wide: MAJNU_DAILY_SEARCH_CAP searches a day (default 300),
// so ad traffic cannot run up the bill. On top of those, a user can start
// 10 finder sessions a day and send 20 messages in one, because every message
// is a model call even when it does not search.
//
// Searches are counted in finder_searches (migration 0004). A search is
// claimed by inserting its row first and counting second: the count includes
// every claim already made, so two requests at the same moment can both be
// refused but never both get through past a limit. A refused or failed search
// deletes its row again.
//
// The user has been identified with getUser() before any of this runs; the
// rows are read and written with the service-role client, because the browser
// must never be able to change what the limits count.
import "server-only"
import { countChatTurns, startOfUtcDay } from "@/lib/limits"
import { createAdminClient } from "@/lib/supabase/admin"
import type { FinderLimitReason } from "./events"
import { textsFor } from "./messages"

export const FINDER_LIMITS = {
  searchesPerDay: 3,
  personalisedPerDay: 2,
  sessionsPerDay: 10,
  messagesPerSession: 20,
} as const

export const DEFAULT_DAILY_SEARCH_CAP = 300

// 0 switches new searches off for everyone.
export function dailySearchCap(): number {
  const raw = process.env.MAJNU_DAILY_SEARCH_CAP?.trim()
  if (!raw) return DEFAULT_DAILY_SEARCH_CAP
  const cap = Number(raw)
  return Number.isInteger(cap) && cap >= 0 ? cap : DEFAULT_DAILY_SEARCH_CAP
}

export type FinderLimit = { ok: true } | { ok: false; reason: FinderLimitReason; message: string }

// Searches already made today, before the one being asked for.
export type SearchCounts = { mine: number; minePersonalised: number; site: number }

function refuse(reason: FinderLimitReason, message: string): FinderLimit {
  return { ok: false, reason, message }
}

// The visitor's own limits come first, so they hear the reason that applies to
// them rather than "the site is busy".
export function searchLimitResult(counts: SearchCounts, personalised: boolean, cap: number, language: string): FinderLimit {
  const texts = textsFor(language).limits
  if (counts.mine >= FINDER_LIMITS.searchesPerDay) return refuse("finder_daily", texts.finder_daily(FINDER_LIMITS.searchesPerDay))
  if (personalised && counts.minePersonalised >= FINDER_LIMITS.personalisedPerDay) {
    return refuse("personalise_daily", texts.personalise_daily(FINDER_LIMITS.personalisedPerDay))
  }
  if (counts.site >= cap) return refuse("site_busy", texts.site_busy(cap))
  return { ok: true }
}

export function sessionsResult(sessionsToday: number, language: string): FinderLimit {
  if (sessionsToday < FINDER_LIMITS.sessionsPerDay) return { ok: true }
  return refuse("finder_daily", textsFor(language).limits.sessions_daily(FINDER_LIMITS.sessionsPerDay))
}

// May the visitor send another message in this session? `chat` is the stored conversation.
export function sessionMessagesResult(chat: unknown[], language: string): FinderLimit {
  if (countChatTurns(chat) < FINDER_LIMITS.messagesPerSession) return { ok: true }
  return refuse("finder_daily", textsFor(language).limits.session_messages(FINDER_LIMITS.messagesPerSession))
}

// ---------- Database ----------

async function countSearches(ownerId: string, now: Date): Promise<SearchCounts> {
  const since = startOfUtcDay(now).toISOString()
  const admin = createAdminClient()
  const [mine, site] = await Promise.all([
    // At most a handful of rows a day, so they are counted here.
    admin.from("finder_searches").select("personalised").eq("owner_id", ownerId).gte("created_at", since),
    admin.from("finder_searches").select("id", { count: "exact", head: true }).gte("created_at", since),
  ])
  if (mine.error) throw new Error(`Could not count today's searches: ${mine.error.message}`)
  if (site.error) throw new Error(`Could not count today's searches: ${site.error.message}`)
  const rows = (mine.data ?? []) as { personalised: boolean }[]
  return { mine: rows.length, minePersonalised: rows.filter((row) => row.personalised).length, site: site.count ?? 0 }
}

async function countSessionsToday(ownerId: string, now: Date): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("finder_sessions")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", startOfUtcDay(now).toISOString())
  if (error) throw new Error(`Could not count today's finder sessions: ${error.message}`)
  return count ?? 0
}

// Before creating a session: the first search of a session is never
// personalised, so a new session is only useful if a plain search is left.
export async function canStartSession(ownerId: string, now: Date, language: string): Promise<FinderLimit> {
  const [sessions, counts] = await Promise.all([countSessionsToday(ownerId, now), countSearches(ownerId, now)])
  const forSessions = sessionsResult(sessions, language)
  if (!forSessions.ok) return forSessions
  return searchLimitResult(counts, false, dailySearchCap(), language)
}

// Whether a search would be allowed now, without claiming it: used before
// asking personalising questions that would only lead to a refused search.
export async function canSearch(ownerId: string, personalised: boolean, now: Date, language: string): Promise<FinderLimit> {
  return searchLimitResult(await countSearches(ownerId, now), personalised, dailySearchCap(), language)
}

export type SearchClaim = { ok: true; claimId: number } | Extract<FinderLimit, { ok: false }>

export async function claimSearch(input: {
  ownerId: string
  sessionId: string
  personalised: boolean
  now: Date
  language: string
}): Promise<SearchClaim> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("finder_searches")
    .insert({ owner_id: input.ownerId, session_id: input.sessionId, personalised: input.personalised })
    .select("id")
    .single<{ id: number }>()
  if (error) throw new Error(`Could not record the search: ${error.message}`)

  let result: FinderLimit
  try {
    const counts = await countSearches(input.ownerId, input.now)
    // The counts include this claim; the limits are about the searches before it.
    const before: SearchCounts = {
      mine: Math.max(0, counts.mine - 1),
      minePersonalised: Math.max(0, counts.minePersonalised - (input.personalised ? 1 : 0)),
      site: Math.max(0, counts.site - 1),
    }
    result = searchLimitResult(before, input.personalised, dailySearchCap(), input.language)
  } catch (countError) {
    await releaseSearch(data.id)
    throw countError
  }
  if (!result.ok) {
    await releaseSearch(data.id)
    return result
  }
  return { ok: true, claimId: data.id }
}

// Gives a claimed search back: it was over a limit, or it failed before the
// visitor got any options. Never throws; a row left behind costs one search.
export async function releaseSearch(claimId: number): Promise<void> {
  try {
    const { error } = await createAdminClient().from("finder_searches").delete().eq("id", claimId)
    if (error) console.error("[finder] could not release a search", { message: error.message })
  } catch (error) {
    console.error("[finder] could not release a search", { message: error instanceof Error ? error.message : String(error) })
  }
}
