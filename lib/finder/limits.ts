// The gift finder's share of the spending guard (docs/plan.md, "Accounts and
// limits"; changed 22 November, issue #70).
//
// - A visitor, guest or member, gets 2 finder sessions per UTC day. A
//   session is one conversation with the finder ("New search" starts
//   another), and it counts only from its first search: a session that never
//   searched costs nothing, and one that searched yesterday counts again on
//   the day it searches again.
// - Each session allows 10 searches, plain or personalised alike. Personalising
//   needs no account and has no cap of its own.
// - A request without a session id continues today's open session (one that
//   still has searches and messages left) instead of starting another, so
//   reloading or reopening the finder never uses up a session by accident.
// - When both of the day's sessions have searched and the open one is spent,
//   searching stops until tomorrow; choosing and wrapping the ideas already
//   shown still works (POST /api/finder/wrap checks only the letter limit).
// - Site-wide: MAJNU_DAILY_SEARCH_CAP searches a day (default 300), so ad
//   traffic cannot run up the bill.
// - Because every message is a model call even when it does not search, a
//   session takes 30 messages, and at most 10 sessions can be started a day.
//   Neither is reached by anyone using the finder as meant.
// - Calendar sessions (lib/finder/pool-limits.ts) do not count towards the
//   finder's 2: they have their own cap of 2 idea pools a day, and the same
//   10 searches per session and the site-wide cap.
//
// Searches are counted in finder_searches (migration 0004), which records the
// session of every search. A search is claimed by inserting its row first and
// counting second: the count includes every claim already made, so two
// requests at the same moment can both be refused but never both get through
// past a limit. A refused or failed search deletes its row again.
//
// The user has been identified with getUser() before any of this runs; the
// rows are read and written with the service-role client, because the browser
// must never be able to change what the limits count.
//
// Public profile reads (issue #34) have their own limits: one per finder
// session, and APIFY_DAILY_CAP Instagram and TikTok reads a UTC day for the
// whole site (default 20), because the Apify credit is $5. They are recorded
// in the session's context (lib/finder/sessions.ts) and claimed the same way
// as searches: record first, count second, take back when over the cap.
import "server-only"
import { countChatTurns, startOfUtcDay } from "@/lib/limits"
import { PAID_SOURCES, usesApify, type ProfileSource } from "@/lib/social/links"
import { createAdminClient } from "@/lib/supabase/admin"
import type { FinderContext, FinderLimitReason } from "./events"
import { textsFor } from "./messages"
import {
  clearProfileRead,
  countProfileReadsSince,
  listTodaysFinderSessions,
  markProfileRead,
  type FinderSession,
  type ProfileRead,
} from "./sessions"

export const FINDER_LIMITS = {
  // Finder sessions that may search on one UTC day, counted from their first search.
  sessionsPerDay: 2,
  // Searches in one session, plain or personalised.
  searchesPerSession: 10,
  // Visitor messages in one session: 10 searches with questions around them.
  messagesPerSession: 30,
  // New sessions a day, searched or not: a guard against a script, never
  // reached by a visitor, because an open session is continued.
  sessionsStartedPerDay: 10,
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

// Searches already made, before the one being asked for.
export type SearchCounts = {
  // In this session, ever.
  session: number
  // In this session, today: above zero, the session already counts today.
  sessionToday: number
  // Other finder sessions (not calendars) that searched today.
  otherSessions: number
  // On the whole site, today.
  site: number
}

function refuse(reason: FinderLimitReason, message: string): FinderLimit {
  return { ok: false, reason, message }
}

// Whether one more search may run in this session. The visitor's own limits
// come first, so they hear the reason that applies to them rather than "the
// site is busy". `calendar` is a calendar's session, which is not one of the
// finder's two a day.
export function searchLimitResult(counts: SearchCounts, opts: { calendar?: boolean }, cap: number, language: string): FinderLimit {
  const texts = textsFor(language).limits
  const calendar = opts.calendar === true
  const usedToday = counts.otherSessions + (counts.sessionToday > 0 ? 1 : 0)
  if (counts.session >= FINDER_LIMITS.searchesPerSession) {
    if (calendar) return refuse("finder_daily", texts.calendar_searches(FINDER_LIMITS.searchesPerSession))
    // A new search helps only while one of today's sessions is left.
    return usedToday < FINDER_LIMITS.sessionsPerDay
      ? refuse("session_full", texts.session_searches(FINDER_LIMITS.searchesPerSession))
      : refuse("finder_daily", texts.finder_daily(FINDER_LIMITS.sessionsPerDay))
  }
  if (!calendar && counts.sessionToday === 0 && counts.otherSessions >= FINDER_LIMITS.sessionsPerDay) {
    return refuse("finder_daily", texts.finder_daily(FINDER_LIMITS.sessionsPerDay))
  }
  if (counts.site >= cap) return refuse("site_busy", texts.site_busy(cap))
  return { ok: true }
}

// Before starting a session: it is only useful if it could search, and a
// script cannot start sessions without end.
export function startSessionResult(sessionsStarted: number, otherSessionsSearched: number, siteSearches: number, cap: number, language: string): FinderLimit {
  if (sessionsStarted >= FINDER_LIMITS.sessionsStartedPerDay) {
    return refuse("finder_daily", textsFor(language).limits.sessions_daily(FINDER_LIMITS.sessionsStartedPerDay))
  }
  return searchLimitResult({ session: 0, sessionToday: 0, otherSessions: otherSessionsSearched, site: siteSearches }, {}, cap, language)
}

// May the visitor send another message in this session? `chat` is the stored conversation.
export function sessionMessagesResult(chat: unknown[], language: string): FinderLimit {
  if (countChatTurns(chat) < FINDER_LIMITS.messagesPerSession) return { ok: true }
  return refuse("session_full", textsFor(language).limits.session_messages(FINDER_LIMITS.messagesPerSession))
}

// A session that can still take a message and a search: the one a request
// without a session id continues.
export function isOpenSession(chat: unknown[], searches: number): boolean {
  return countChatTurns(chat) < FINDER_LIMITS.messagesPerSession && searches < FINDER_LIMITS.searchesPerSession
}

// ---------- Database ----------

type SearchRow = { session_id: string | null }

const sinceToday = (now: Date) => startOfUtcDay(now).toISOString()

// The searches of one session, and today's searches of one user and of the site.
async function searchRows(ownerId: string, sessionId: string | null, now: Date) {
  const admin = createAdminClient()
  const since = sinceToday(now)
  const [mine, session, site] = await Promise.all([
    // At most a few dozen rows a day, so they are counted here.
    admin.from("finder_searches").select("session_id").eq("owner_id", ownerId).gte("created_at", since),
    sessionId
      ? admin.from("finder_searches").select("id", { count: "exact", head: true }).eq("session_id", sessionId)
      : Promise.resolve({ count: 0, error: null }),
    admin.from("finder_searches").select("id", { count: "exact", head: true }).gte("created_at", since),
  ])
  if (mine.error) throw new Error(`Could not count today's searches: ${mine.error.message}`)
  if (session.error) throw new Error(`Could not count the session's searches: ${session.error.message}`)
  if (site.error) throw new Error(`Could not count today's searches: ${site.error.message}`)
  return { today: (mine.data ?? []) as SearchRow[], session: session.count ?? 0, site: site.count ?? 0 }
}

// Of these sessions, the finder's own: calendar sessions carry a `calendar`
// marker in their context (lib/calendars/sessions.ts) and are left out.
async function finderSessionsAmong(ownerId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0
  const { count, error } = await createAdminClient()
    .from("finder_sessions")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .in("id", ids)
    .is("context->calendar", null)
  if (error) throw new Error(`Could not count today's finder sessions: ${error.message}`)
  return count ?? 0
}

// Every count, including any claim already made.
export async function countSearches(ownerId: string, sessionId: string | null, now: Date): Promise<SearchCounts> {
  const rows = await searchRows(ownerId, sessionId, now)
  const others = [...new Set(rows.today.map((row) => row.session_id).filter((id): id is string => Boolean(id) && id !== sessionId))]
  return {
    session: rows.session,
    sessionToday: sessionId ? rows.today.filter((row) => row.session_id === sessionId).length : 0,
    otherSessions: await finderSessionsAmong(ownerId, others),
    site: rows.site,
  }
}

async function countSessionsStartedToday(ownerId: string, now: Date): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("finder_sessions")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", ownerId)
    .gte("created_at", sinceToday(now))
  if (error) throw new Error(`Could not count today's finder sessions: ${error.message}`)
  return count ?? 0
}

// Before creating a session for a request without one.
export async function canStartSession(ownerId: string, now: Date, language: string): Promise<FinderLimit> {
  const [started, counts] = await Promise.all([countSessionsStartedToday(ownerId, now), countSearches(ownerId, null, now)])
  return startSessionResult(started, counts.otherSessions, counts.site, dailySearchCap(), language)
}

// Today's open finder session, newest first, for a request without a session
// id: reloading the page or reopening the finder continues it. Null when
// there is none, and a new one may be started.
export async function findOpenSession(ownerId: string, now: Date): Promise<FinderSession | null> {
  for (const session of await listTodaysFinderSessions(ownerId, now)) {
    const { session: searches } = await searchRows(ownerId, session.id, now)
    if (isOpenSession(session.chat, searches)) return session
  }
  return null
}

// Whether a search would be allowed now in this session, without claiming it:
// used before asking questions or reading a profile that would only lead to a
// refused search.
export async function canSearch(ownerId: string, sessionId: string, now: Date, language: string): Promise<FinderLimit> {
  return searchLimitResult(await countSearches(ownerId, sessionId, now), {}, dailySearchCap(), language)
}

export type SearchClaim = { ok: true; claimId: number } | Extract<FinderLimit, { ok: false }>

export async function claimSearch(input: {
  ownerId: string
  sessionId: string
  // Recorded with the search; it no longer changes the limits.
  personalised: boolean
  now: Date
  language: string
  // A calendar's session (lib/finder/pool-limits.ts).
  calendar?: boolean
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
    const counts = await countSearches(input.ownerId, input.sessionId, input.now)
    // The counts include this claim; the limits are about the searches before it.
    const before: SearchCounts = {
      session: Math.max(0, counts.session - 1),
      sessionToday: Math.max(0, counts.sessionToday - 1),
      otherSessions: counts.otherSessions,
      site: Math.max(0, counts.site - 1),
    }
    result = searchLimitResult(before, { calendar: input.calendar }, dailySearchCap(), input.language)
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

// ---------- Public profile reads ----------

export const DEFAULT_APIFY_DAILY_CAP = 20

// Paid profile reads (Instagram and TikTok through Apify, LinkedIn and
// Instagram's second route through Bright Data) the whole site may run per UTC
// day. 0 switches them off.
export function apifyDailyCap(): number {
  const raw = process.env.APIFY_DAILY_CAP?.trim()
  if (!raw) return DEFAULT_APIFY_DAILY_CAP
  const cap = Number(raw)
  return Number.isInteger(cap) && cap >= 0 ? cap : DEFAULT_APIFY_DAILY_CAP
}

export type ProfileClaim = { ok: true; profile: ProfileRead } | { ok: false; reason: "session" | "daily_cap" }

// Claims this session's one profile read. A read that then fails still counts,
// because Apify or Bright Data may already have charged for it.
export async function claimProfileRead(input: {
  session: Pick<FinderSession, "id" | "ownerId">
  context: FinderContext
  source: ProfileSource
  now: Date
}): Promise<ProfileClaim> {
  const apify = usesApify(input.source)
  const cap = apifyDailyCap()
  if (apify && cap === 0) return { ok: false, reason: "daily_cap" }

  const profile: ProfileRead = { source: input.source, readAt: input.now.toISOString(), interests: [] }
  if (!(await markProfileRead(input.session, input.context, profile))) return { ok: false, reason: "session" }
  if (!apify) return { ok: true, profile }

  let count: number
  try {
    count = await countProfileReadsSince(startOfUtcDay(input.now), PAID_SOURCES)
  } catch (error) {
    await clearProfileRead(input.session, input.context)
    throw error
  }
  // The count includes this claim; the cap is about the reads before it.
  if (count - 1 >= cap) {
    await clearProfileRead(input.session, input.context)
    return { ok: false, reason: "daily_cap" }
  }
  return { ok: true, profile }
}
