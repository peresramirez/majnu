// Limits for the finder's calendar mode (issue #48), on top of the finder's own
// (lib/finder/limits.ts). Changed 22 November with the finder's limits (issue
// #70), so both count the same way, by session:
//
// - A calendar has its own finder session (one whose context has a `calendar`
//   marker, see lib/calendars/sessions.ts). Calendar sessions are not among
//   the finder's daily sessions: making a calendar never uses up a gift search.
// - A pool of ideas is a search in that session: at most POOLS_PER_DAY pools a
//   day per user, the calendar's counterpart of the finder's daily sessions.
// - "More like this" is a later search in the same session. Like every
//   session, a calendar's allows FINDER_LIMITS.searchesPerSession searches,
//   its pools included. There is no personalised cap any more.
// - Every search counts against the site-wide MAJNU_DAILY_SEARCH_CAP.
//
// Claims are made as the finder makes them: the row goes in first and is
// counted second, so two requests at the same moment can both be refused but
// never both get past a limit; a refused or failed run gives its row back.
import "server-only"
import { startOfUtcDay } from "@/lib/limits"
import { createAdminClient } from "@/lib/supabase/admin"
import type { FinderLimitReason } from "./events"
import { claimSearch, releaseSearch, type FinderLimit, type SearchClaim } from "./limits"

export const POOLS_PER_DAY = 2

const POOL_TEXTS = {
  en: (n: number) =>
    `You have found ideas for calendars ${n} times today, the most for one day. Fill the doors with the ideas you have, add your own, or come back tomorrow.`,
  de: (n: number) =>
    `Du hast heute schon ${n}-mal Ideen für Kalender gesucht, mehr geht an einem Tag nicht. Füll die Türchen mit den Ideen, die du hast, mit eigenen Geschenken, oder schau morgen wieder vorbei.`,
}

// `poolsBefore`: pools already claimed today, not counting the one asked for.
export function poolLimitResult(poolsBefore: number, language: string): FinderLimit {
  if (poolsBefore < POOLS_PER_DAY) return { ok: true }
  const text = language.toLowerCase().startsWith("de") ? POOL_TEXTS.de : POOL_TEXTS.en
  return { ok: false, reason: "finder_daily", message: text(POOLS_PER_DAY) }
}

// Plain searches made today in the user's calendar sessions, this one included
// once it has been claimed.
export async function countPoolsToday(ownerId: string, now: Date): Promise<number> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from("finder_searches")
    .select("session_id")
    .eq("owner_id", ownerId)
    .eq("personalised", false)
    .gte("created_at", startOfUtcDay(now).toISOString())
  if (error) throw new Error(`Could not count today's calendar ideas: ${error.message}`)
  const sessionIds = [...new Set(((data ?? []) as { session_id: string | null }[]).map((row) => row.session_id).filter((id): id is string => Boolean(id)))]
  if (sessionIds.length === 0) return 0
  const { data: calendars, error: sessionError } = await admin
    .from("finder_sessions")
    .select("id")
    .eq("owner_id", ownerId)
    .in("id", sessionIds)
    .not("context->calendar", "is", null)
  if (sessionError) throw new Error(`Could not count today's calendar ideas: ${sessionError.message}`)
  const calendarIds = new Set(((calendars ?? []) as { id: string }[]).map((row) => row.id))
  return ((data ?? []) as { session_id: string | null }[]).filter((row) => row.session_id && calendarIds.has(row.session_id)).length
}

// What a calendar search answers: the calendar's own reasons, never the
// finder's "start a new search" (a calendar has one session).
export type CalendarSearchClaim =
  | { ok: true; claimId: number }
  | { ok: false; reason: Exclude<FinderLimitReason, "session_full">; message: string }

function forCalendar(claim: SearchClaim): CalendarSearchClaim {
  if (claim.ok) return claim
  return { ok: false, reason: claim.reason === "session_full" ? "finder_daily" : claim.reason, message: claim.message }
}

// Claims a pool for a calendar's session: a search there, then the pool cap.
export async function claimPool(input: { ownerId: string; sessionId: string; now: Date; language: string }): Promise<CalendarSearchClaim> {
  const claim = forCalendar(await claimSearch({ ...input, personalised: false, calendar: true }))
  if (!claim.ok) return claim
  let result: FinderLimit
  try {
    // The count includes this claim; the cap is about the pools before it.
    result = poolLimitResult(Math.max(0, (await countPoolsToday(input.ownerId, input.now)) - 1), input.language)
  } catch (error) {
    await releaseSearch(claim.claimId)
    throw error
  }
  if (!result.ok) {
    await releaseSearch(claim.claimId)
    return forCalendar(result as SearchClaim)
  }
  return claim
}

// "More like this": a later search in the calendar's session.
export async function claimMoreLikeThis(input: { ownerId: string; sessionId: string; now: Date; language: string }): Promise<CalendarSearchClaim> {
  return forCalendar(await claimSearch({ ...input, personalised: true, calendar: true }))
}

export { releaseSearch }
