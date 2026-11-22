// POST /api/finder: one visitor message to the gift finder, answered as a
// stream of newline-delimited FinderEvents (lib/finder/events.ts), always
// ending with `done`. A message without a session id continues today's open
// session, if there is one (a reload or the finder opened again must not use
// up one of the day's sessions, issue #70), or else creates a session; either
// way `session` comes before anything else.
//
// Every request needs a Supabase session; anonymous accounts count (docs/plan.md,
// "Accounts and limits"). Before the stream starts, failures are plain HTTP
// errors with a JSON body: 401 { "error": "session_required" }, and otherwise
// { error } with a short message in the visitor's language: 400 bad body,
// 413 a message over 2,000 characters, 404 not your session (or, on the wrap
// step, an option that is not among the session's last options), 500 the
// session could not be loaded or created.
//
// On the wrap step the body carries `wrap: { optionId, templateId }` (issue
// #70). The option is looked up in the session's own last options, never taken
// from the browser, and Majnu hears the choice in the context block.
// Limits reached before any model call (sessions or searches for the day,
// messages in this session) are a stream of `limit` and `done`.
import { getCloudflareContext } from "@opennextjs/cloudflare"
import * as z from "zod/v4"
import { describeError } from "@/lib/agents/errors"
import { runFinderTurn, type FinderTurnState, type WrapFrame } from "@/lib/finder/agent"
import { baseContext, canonicalLocale, localeTimezone, requestLocation } from "@/lib/finder/context"
import type { FinderEvent } from "@/lib/finder/events"
import { canStartSession, findOpenSession, sessionMessagesResult } from "@/lib/finder/limits"
import { textsFor } from "@/lib/finder/messages"
import { createFinderSession, getMyFinderSession, saveFinderSession, type FinderSession } from "@/lib/finder/sessions"
import { NDJSON_CONTENT_TYPE, createFinderStream } from "@/lib/finder/stream"
import { WRAP_TEMPLATE_IDS } from "@/lib/finder/wrap-templates"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// Part of the spending guard: a finder message is a short ask or an answer to a
// question. Not exported: a route file may only export its handlers and config.
const MAX_MESSAGE_LENGTH = 2000

const FinderRequestBody = z.object({
  sessionId: z.string().min(1).max(100).optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  // Lenient: a missing or odd locale means English and Europe/Berlin, not an error.
  locale: z
    .object({
      language: z.string().max(35).catch(""),
      languages: z.array(z.string().max(35)).max(10).optional().catch(undefined),
      timezone: z.string().max(64).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
  // Strict: a choice that does not parse is refused, not dropped, so Majnu
  // never answers a wrap-step message as if the visitor had chosen nothing.
  wrap: z
    .object({
      optionId: z.string().min(1).max(64),
      templateId: z.enum(WRAP_TEMPLATE_IDS),
    })
    .optional(),
})

const NO_STORE = { "Cache-Control": "no-store" }

function json(status: number, body: Record<string, string>): Response {
  return Response.json(body, { status, headers: NO_STORE })
}

function eventResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: { ...NO_STORE, "Content-Type": NDJSON_CONTENT_TYPE, "X-Content-Type-Options": "nosniff" },
  })
}

// A stream that is already complete, for answers that need no model call.
function fixedEvents(events: FinderEvent[]): Response {
  const out = createFinderStream()
  for (const event of events) out.emit(event)
  out.emit({ type: "done" })
  out.close()
  return eventResponse(out.stream)
}

// Keeps the Worker alive until the turn is saved, even if the visitor closes
// the finder: options shown but not saved could not be wrapped.
function keepRunning(work: Promise<void>): void {
  try {
    getCloudflareContext().ctx.waitUntil(work)
  } catch {
    // Not running on Workers (next dev, tests): the process stays up anyway.
  }
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json(401, { error: "session_required" })

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return json(400, { error: textsFor(undefined).requests.noMessage })
  }
  const body = FinderRequestBody.safeParse(raw)
  if (!body.success) {
    const language = (raw as { locale?: { language?: unknown } } | null)?.locale?.language
    const texts = textsFor(typeof language === "string" ? language : undefined).requests
    const tooLong = body.error.issues.some((issue) => issue.path[0] === "message" && issue.code === "too_big")
    // 413 for a long message: the finder chat shows its own sentence for it.
    return tooLong ? json(413, { error: texts.tooLong }) : json(400, { error: texts.noMessage })
  }

  const now = new Date()
  const locale = body.data.locale
  const base = baseContext(requestLocation(request), locale)
  const timezone = localeTimezone(locale)
  const texts = textsFor(base.language)

  // A wrap choice needs the session whose options it chose from.
  if (body.data.wrap && !body.data.sessionId) return json(404, { error: texts.requests.optionNotFound })

  let session: FinderSession
  // Majnu hears that the visitor started over when an open session is
  // continued for a request that had no id: they see none of it any more.
  let startedOver = false
  let wrap: WrapFrame | null = null
  try {
    if (body.data.sessionId) {
      const existing = await getMyFinderSession(body.data.sessionId)
      if (!existing) return json(404, { error: texts.requests.sessionNotFound })
      if (body.data.wrap) {
        const { optionId, templateId } = body.data.wrap
        const option = existing.lastOptions?.options.find((o) => o.id === optionId)
        if (!option) return json(404, { error: texts.requests.optionNotFound })
        wrap = { option, templateId }
      }
      const turns = sessionMessagesResult(existing.chat, base.language)
      if (!turns.ok) return fixedEvents([{ type: "limit", reason: turns.reason, message: turns.message }])
      session = existing
    } else {
      const open = await findOpenSession(user.id, now)
      if (open) {
        session = open
        startedOver = open.chat.length > 0
      } else {
        const allowed = await canStartSession(user.id, now, base.language)
        if (!allowed.ok) return fixedEvents([{ type: "limit", reason: allowed.reason, message: allowed.message }])
        session = await createFinderSession(user.id, base, timezone)
      }
    }
  } catch (error) {
    console.error("[finder] could not load or create the session", describeError(error))
    return json(500, { error: texts.errors.generic })
  }

  const out = createFinderStream()
  const state: FinderTurnState = {
    sessionId: session.id,
    ownerId: user.id,
    now,
    timezone,
    base,
    browserLanguage: canonicalLocale(locale?.language) ?? base.language,
    context: session.context,
    lastOptions: session.lastOptions,
    profile: session.profile,
    wrap,
    startedOver,
    emit: out.emit,
  }

  // The rest runs while the response streams. Waiting on the model does not
  // count against the Worker's CPU limit; this code does, so it stays small.
  const turnWork = (async () => {
    try {
      // First, so the client can send the id with every later message.
      if (!body.data.sessionId) out.emit({ type: "session", sessionId: session.id })

      const result = await runFinderTurn({ history: session.chat, message: body.data.message, state })

      // Append-only: what was loaded, then this turn's messages as the API saw them.
      if (result.appended.some((message) => message.role === "assistant")) {
        try {
          await saveFinderSession(session, {
            chat: [...session.chat, ...result.appended],
            context: state.context,
            lastOptions: state.lastOptions,
            profile: state.profile,
          })
        } catch (error) {
          console.error("[finder] could not save the session", describeError(error))
          out.emit({ type: "error", message: textsFor(state.context.language).errors.saving })
        }
      }
    } catch (error) {
      console.error("[finder] turn failed", describeError(error))
      out.emit({ type: "error", message: textsFor(state.context.language).errors.generic })
    } finally {
      out.emit({ type: "done" })
      out.close()
    }
  })()
  keepRunning(turnWork)

  return eventResponse(out.stream)
}
