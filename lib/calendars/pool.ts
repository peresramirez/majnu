// Finding a calendar's pool of ideas (issue #48), end to end: the limits, the
// optional public profile, one research run in the finder's calendar mode
// (lib/finder/pool.ts), and saving the pool on the calendar's finder session.
// The route has already checked the session, the account and the letter.
import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { describeError } from "@/lib/agents/errors"
import { mergeInterests, recipientBrief } from "@/lib/finder/agent"
import { placeName } from "@/lib/finder/context"
import type { FinderContext, GiftOption } from "@/lib/finder/events"
import { claimProfileRead } from "@/lib/finder/limits"
import { MAX_POOL_SIZE, poolSize, researchPool, ResearchRefusal, SIMILAR_IDEAS, toPoolOptions, type PoolInput } from "@/lib/finder/pool"
import { claimMoreLikeThis, claimPool, releaseSearch } from "@/lib/finder/pool-limits"
import type { ProfileRead } from "@/lib/finder/sessions"
import type { CalendarContent, CalendarTemplateId } from "@/lib/letters/schema"
import { parseProfileLink } from "@/lib/social/links"
import { canReadSource, readProfileInterests } from "@/lib/social/read"
import { saveCalendarPool, storedPool, type CalendarSession } from "./sessions"
import type { CalendarErrorReason } from "./types"

// The editor speaks English, so limit sentences are in English; the ideas
// themselves are in the sender's language.
const UI_LANGUAGE = "en"

export type PoolOutcome =
  | { ok: true; pool: GiftOption[]; lastDoorId: string | null; added: number }
  | { ok: false; status: number; reason: CalendarErrorReason; message: string }

const TEXTS = {
  ideaNotFound: "That idea is no longer in the list. Choose another one.",
  full: "There are plenty of ideas already. Pick from those, or add your own gift.",
  failed: "Something went wrong looking for ideas. Try again.",
  busy: "A lot of people are looking for gifts right now. Try again in a minute.",
  refused: "Majnu can't look for ideas for this one. Try changing what you wrote about them.",
  nothing: "Majnu couldn't find ideas with a shop link this time. Try again, or add your own gifts.",
}

function failure(status: number, reason: CalendarErrorReason, message: string): PoolOutcome {
  return { ok: false, status, reason, message }
}

function calendarLine(templateId: CalendarTemplateId, content: CalendarContent): string {
  const doors = content.doors.length
  return templateId === "advent-classic"
    ? `An advent calendar with ${doors} doors, one a day from ${content.startDate}. Every door holds one small gift.`
    : `A countdown of ${doors} days from ${content.startDate}, one small gift a day up to the big day.`
}

// The research input for this calendar.
export function poolInput(input: {
  session: CalendarSession
  context: FinderContext
  content: CalendarContent
  templateId: CalendarTemplateId
  mode: PoolInput["mode"]
  similarTo?: GiftOption
  now: Date
}): PoolInput {
  const { session, context, content } = input
  const { marker } = session
  const recipient = recipientBrief(
    {
      relationship: context.relationship || "someone they love",
      kind: marker.kind,
      ...(marker.name ? { name: marker.name } : {}),
      // Only an age the sender gave; recipientBrief marks the context's assumed range as assumed.
      ...(marker.age !== undefined ? { age: { min: marker.age, max: marker.age } } : {}),
      about: marker.about || "The sender gave no more details.",
    },
    context,
  )
  return {
    mode: input.mode,
    recipient,
    calendar: calendarLine(input.templateId, content),
    doorBudget: marker.doorBudget || "small, under about 10 euros",
    ...(marker.lastDoorBudget ? { lastDoorBudget: marker.lastDoorBudget } : {}),
    country: placeName(context),
    countryCode: context.country,
    currency: context.currency,
    language: context.language,
    ideas: input.mode === "pool" ? poolSize(content.doors.length) : SIMILAR_IDEAS,
    ...(input.similarTo ? { similarTo: input.similarTo, avoid: session.pool?.options.map((o) => o.title) ?? [] } : {}),
    now: input.now,
    timezone: content.timezone,
  }
}

// The public profile the sender gave, read once for the calendar (one read per
// session and APIFY_DAILY_CAP, as in the finder). Best effort: a profile that
// cannot be read only means the pool is found without it.
async function readProfileFor(session: CalendarSession, now: Date): Promise<{ profile: ProfileRead; interests: string[] } | null> {
  const link = session.marker.profileLink
  if (!link || session.profile) return null
  const parsed = parseProfileLink(link)
  if (!parsed.ok || !canReadSource(parsed.target.source)) return null
  try {
    // markProfileRead() rewrites the context column, so it gets the marker too.
    const context: FinderContext = Object.assign({}, session.context, { calendar: session.marker })
    const claim = await claimProfileRead({ session, context, source: parsed.target.source, now })
    if (!claim.ok) return null
    const read = await readProfileInterests(parsed.target, session.context.language)
    const interests = read.ok ? read.interests : []
    return { profile: { ...claim.profile, interests }, interests }
  } catch (error) {
    console.error("[calendars] profile read failed", describeError(error))
    return null
  }
}

export async function runPool(input: {
  session: CalendarSession
  content: CalendarContent
  templateId: CalendarTemplateId
  similarTo?: string
  now: Date
}): Promise<PoolOutcome> {
  const { session, now } = input
  const existing = session.pool?.options ?? []
  let similar: GiftOption | undefined
  if (input.similarTo) {
    similar = existing.find((option) => option.id === input.similarTo)
    if (!similar) return failure(404, "not_found", TEXTS.ideaNotFound)
    if (existing.length >= MAX_POOL_SIZE) return failure(409, "invalid", TEXTS.full)
  }

  const claimInput = { ownerId: session.ownerId, sessionId: session.id, now, language: UI_LANGUAGE }
  const claim = similar ? await claimMoreLikeThis(claimInput) : await claimPool(claimInput)
  if (!claim.ok) return failure(429, claim.reason === "signin_required" ? "signin_required" : claim.reason, claim.message)

  let context = session.context
  let profile = session.profile
  if (!similar) {
    const read = await readProfileFor(session, now)
    if (read) {
      profile = read.profile
      const interests = mergeInterests(context.interests ?? [], read.interests)
      context = { ...context, ...(interests.length ? { interests } : {}) }
    }
  }

  let report: Awaited<ReturnType<typeof researchPool>>
  try {
    report = await researchPool(poolInput({ ...input, context, mode: similar ? "similar" : "pool", similarTo: similar }))
  } catch (error) {
    await releaseSearch(claim.claimId)
    console.error("[calendars] pool research failed", describeError(error))
    if (error instanceof ResearchRefusal) return failure(422, "failed", TEXTS.refused)
    if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError) return failure(503, "failed", TEXTS.busy)
    return failure(502, "failed", TEXTS.failed)
  }

  const found = toPoolOptions(report, similar ? existing : [])
  if (found.options.length === 0) {
    // Nothing the sender could open: the search does not count against them.
    await releaseSearch(claim.claimId)
    return failure(502, "failed", TEXTS.nothing)
  }

  const pool = similar ? [...existing, ...found.options].slice(0, MAX_POOL_SIZE) : found.options
  const lastDoorId = similar ? session.pool?.recommendedId || null : found.lastDoorId
  const why = similar ? (session.pool?.why ?? "") : report.why
  await saveCalendarPool(session, { pool: storedPool(pool, lastDoorId, why), context, profile })
  return { ok: true, pool, lastDoorId, added: found.options.length }
}
