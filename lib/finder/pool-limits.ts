// Limits for the finder's calendar mode (issue #48), on top of the finder's own
// (lib/finder/limits.ts), which stay exactly as they are:
//
// - A pool of ideas for a calendar is one finder search: it is claimed with
//   claimSearch() as a plain search, so it counts against the 3 searches a day
//   and the site-wide MAJNU_DAILY_SEARCH_CAP like any other.
// - On top of that, at most POOLS_PER_DAY pools a day per user. A pool is a
//   plain search made in a calendar's finder session (one whose context has a
//   `calendar` marker, see lib/calendars/sessions.ts), so no new table is needed.
// - "More like this" is a later search in the same session, so, by the
//   finder's rule for later searches, it is claimed as a personalised one
//   (2 a day, within the 3).
//
// Claims are made as the finder makes them: the row goes in first and is
// counted second, so two requests at the same moment can both be refused but
// never both get past a limit; a refused or failed run gives its row back.
import "server-only"
import { startOfUtcDay } from "@/lib/limits"
import { createAdminClient } from "@/lib/supabase/admin"
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

// Claims a pool for a calendar's session: a plain finder search, then the pool cap.
export async function claimPool(input: { ownerId: string; sessionId: string; now: Date; language: string }): Promise<SearchClaim> {
  const claim = await claimSearch({ ...input, personalised: false })
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
    return result
  }
  return claim
}

// "More like this": a personalised finder search in the calendar's session.
export function claimMoreLikeThis(input: { ownerId: string; sessionId: string; now: Date; language: string }): Promise<SearchClaim> {
  return claimSearch({ ...input, personalised: true })
}

export { releaseSearch }
