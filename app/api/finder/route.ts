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
//
// Photos and documents (issue #77): a message with files comes as
// multipart/form-data, the request as JSON in the `request` part and up to 3
// `file` parts; its message may be empty. Each file's real type is checked
// from its first bytes (lib/finder/file-rules.ts), never its name or declared
// type, and anything else is refused before the stream with { error }: 400
// (too many files, an empty file, a PDF over 20 pages, locked or unreadable),
// 413 (a file or all of them too large) or 415 (not a photo, PDF or text
// file). Then, inside the stream and before Majnu answers, the files are
// claimed against their limits, read once each (lib/finder/attachments.ts),
// and only their notes are kept: in the session's context, shown as chips,
// and as text in the stored conversation. No file is stored.
//
// The instant first answer (issue #97): the first message of a conversation
// as the visitor sees it (no session id, or a session that has shown nothing),
// without files or a wrap choice, is answered here with six gifts from
// Majnu's own catalogue (lib/finder/catalog-match.ts) and no model call: the
// text line, the options with source "catalogue", then done. The options are
// saved as the session's last options, so they can be chosen and wrapped, with
// a marker that tells the next model turn what the visitor saw. Without
// catalogue rows the message goes to Majnu, who asks first, as before.
import { getCloudflareContext } from "@opennextjs/cloudflare"
import * as z from "zod/v4"
import { describeError } from "@/lib/agents/errors"
import { loadCatalogue } from "@/lib/finder/catalog"
import { catalogueAnswer, catalogueShownText, type CatalogueAnswer } from "@/lib/finder/catalog-match"
import { runFinderTurn, type FinderTurnState, type WrapFrame } from "@/lib/finder/agent"
import { mergeNotes, readMessageFiles, sharedFilesText, type ReadableFile } from "@/lib/finder/attachments"
import { baseContext, canonicalLocale, localeTimezone, requestLocation } from "@/lib/finder/context"
import { FINDER_FILE_PART, FINDER_REQUEST_PART, type FinderEvent } from "@/lib/finder/events"
import { FILE_LIMITS, checkSharedFile, displayFileName, type FileProblem } from "@/lib/finder/file-rules"
import { canStartSession, findOpenSession, sessionMessagesResult } from "@/lib/finder/limits"
import { countOwnAnswers, personalisationScore } from "@/lib/finder/personalisation"
import { textsFor } from "@/lib/finder/messages"
import { createFinderSession, getMyFinderSession, saveFinderSession, type FinderSession, type StoredOptions } from "@/lib/finder/sessions"
import { NDJSON_CONTENT_TYPE, createFinderStream } from "@/lib/finder/stream"
import { WRAP_TEMPLATE_IDS } from "@/lib/finder/wrap-templates"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// Part of the spending guard: a finder message is a short ask or an answer to a
// question. Not exported: a route file may only export its handlers and config.
const MAX_MESSAGE_LENGTH = 2000

// The whole multipart body: the files' own limit and a little for the request part.
const MAX_MULTIPART_BYTES = FILE_LIMITS.messageBytes + 64 * 1024

const FinderRequestBody = z.object({
  sessionId: z.string().min(1).max(100).optional(),
  // May be empty only when files come with it (checked below).
  message: z.string().trim().max(MAX_MESSAGE_LENGTH),
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

type Texts = ReturnType<typeof textsFor>

// The visitor's own words in the stored conversation: the text blocks of user
// turns that are not the app's (context, catalogue and file blocks start with "<").
function visitorTexts(chat: FinderSession["chat"]): string[] {
  return chat.flatMap((message) =>
    message.role === "user" && Array.isArray(message.content)
      ? message.content.flatMap((block) => (block.type === "text" && !block.text.startsWith("<") ? [block.text] : []))
      : [],
  )
}

function withoutMarker(shown: StoredOptions): StoredOptions {
  if (!shown.catalogue) return shown
  const { options, recommendedId, why } = shown
  return { options, recommendedId, why }
}

// The body as JSON, or a multipart body's request part and its files. Null
// when it cannot be read; "too_big" for a multipart body over the limit.
async function readBody(request: Request): Promise<{ raw: unknown; files: File[] } | null | "too_big"> {
  const type = request.headers.get("content-type") ?? ""
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    try {
      return { raw: await request.json(), files: [] }
    } catch {
      return null
    }
  }
  const length = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(length) && length > MAX_MULTIPART_BYTES) return "too_big"
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return null
  }
  const part = form.get(FINDER_REQUEST_PART)
  if (typeof part !== "string") return null
  try {
    const files = form.getAll(FINDER_FILE_PART).filter((value): value is File => typeof value !== "string")
    return { raw: JSON.parse(part), files }
  } catch {
    return null
  }
}

function fileProblem(problem: FileProblem, name: string, kind: string | undefined, texts: Texts): Response {
  const t = texts.files
  const mb = (bytes: number) => Math.round(bytes / (1024 * 1024))
  switch (problem) {
    case "type":
      return json(415, { error: t.type(name) })
    case "empty":
      return json(400, { error: t.empty(name) })
    case "too_big":
      if (kind === "pdf") return json(413, { error: t.pdfTooBig(name, mb(FILE_LIMITS.pdfBytes)) })
      if (kind === "text") return json(413, { error: t.textTooBig(name, Math.round(FILE_LIMITS.textBytes / 1024)) })
      return json(413, { error: t.imageTooBig(name, mb(FILE_LIMITS.imageBytes)) })
    case "pdf_pages":
      return json(400, { error: t.pdfPages(name, FILE_LIMITS.pdfPages) })
    case "pdf_locked":
      return json(400, { error: t.pdfLocked(name) })
    case "pdf_unreadable":
      return json(400, { error: t.pdfUnreadable(name) })
  }
}

// Every file checked, in order, or the answer for the first one that is refused.
async function checkFiles(files: File[], texts: Texts): Promise<ReadableFile[] | Response> {
  if (files.length > FILE_LIMITS.perMessage) return json(400, { error: texts.files.tooMany(FILE_LIMITS.perMessage) })
  const total = files.reduce((sum, file) => sum + file.size, 0)
  if (total > FILE_LIMITS.messageBytes) return json(413, { error: texts.files.tooBigTogether })
  const checked: ReadableFile[] = []
  for (const file of files) {
    const result = await checkSharedFile(new Uint8Array(await file.arrayBuffer()))
    if (!result.ok) return fileProblem(result.problem, displayFileName(file.name), result.kind, texts)
    checked.push(result)
  }
  return checked
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

  const read = await readBody(request)
  if (read === "too_big") return json(413, { error: textsFor(undefined).files.tooBigTogether })
  if (!read) return json(400, { error: textsFor(undefined).requests.noMessage })
  const raw = read.raw
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

  if (!body.data.message && read.files.length === 0) return json(400, { error: texts.requests.noMessage })
  // Checked before a session is made or loaded: a refused file costs nothing.
  const files = await checkFiles(read.files, texts)
  if (files instanceof Response) return files
  const fileCount = files.length

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

  // The instant answer for a first message, when the catalogue has gifts for it.
  const firstView = !body.data.sessionId || (session.chat.length === 0 && !session.lastOptions)
  let instant: CatalogueAnswer | null = null
  if (firstView && !body.data.wrap && fileCount === 0 && body.data.message) {
    instant = catalogueAnswer({
      rows: await loadCatalogue(),
      message: body.data.message,
      seed: session.id,
      // A fresh start: the visitor sees nothing said before this message.
      context: base,
      browserLanguage: base.language,
      startedOver,
    })
  }

  // The first model turn after the instant answer hears what it showed.
  const marker = !instant && body.data.sessionId ? session.lastOptions?.catalogue : undefined
  // Saved without the marker after that turn: it is heard once.
  const lastOptions = session.lastOptions ? withoutMarker(session.lastOptions) : null

  const out = createFinderStream()
  // Every context event carries the personalisation score (issue #97): what
  // Majnu knows, the profiles read so far, and the visitor's own answers in
  // this conversation, this message included.
  const ownAnswers = countOwnAnswers([...visitorTexts(instant ? [] : session.chat), body.data.message])
  const emit = (event: FinderEvent) => {
    if (event.type !== "context") return out.emit(event)
    const profilesRead = state.profiles.reads.filter((read) => read.status === "read").length
    out.emit({ ...event, personalisation: personalisationScore({ context: event.context, profilesRead, ownAnswers }) })
  }
  const state: FinderTurnState = {
    sessionId: session.id,
    ownerId: user.id,
    now,
    timezone,
    base,
    browserLanguage: canonicalLocale(locale?.language) ?? base.language,
    context: session.context,
    lastOptions,
    profiles: session.profiles,
    wrap,
    startedOver: startedOver || marker?.startedOver === true,
    // The first message the visitor sees in this conversation, when the
    // catalogue did not answer it: Majnu asks one round of questions before it
    // searches. After the catalogue's answer, Majnu may search at once.
    askFirst: !marker && (session.chat.length === 0 || startedOver),
    catalogueShown: marker && session.lastOptions ? catalogueShownText({ ...session.lastOptions, catalogue: marker }) : null,
    emit,
  }

  // The rest runs while the response streams. Waiting on the model does not
  // count against the Worker's CPU limit; this code does, so it stays small.
  const turnWork = (async () => {
    try {
      // First, so the client can send the id with every later message.
      if (!body.data.sessionId) out.emit({ type: "session", sessionId: session.id })

      if (instant) {
        // Saved before the cards appear, so a quick "Choose" finds them.
        try {
          await saveFinderSession(session, { chat: session.chat, context: instant.context, lastOptions: instant.options })
        } catch (error) {
          console.error("[finder] could not save the catalogue's options", describeError(error))
          out.emit({ type: "error", message: textsFor(instant.language).errors.saving })
          return
        }
        emit({ type: "context", context: instant.context })
        out.emit({ type: "text", delta: instant.line })
        const { options, recommendedId, why } = instant.options
        out.emit({ type: "options", options, recommendedId, why, source: "catalogue" })
        return
      }

      if (fileCount > 0) {
        const shared = await readMessageFiles({ files, session, now, language: base.language, emit: out.emit })
        // The bytes are not needed any more: let them go before Majnu answers.
        files.splice(0)
        if (shared.notes.length > 0) {
          state.context = { ...state.context, notes: mergeNotes(state.context.notes ?? [], shared.notes) }
          emit({ type: "context", context: state.context })
        }
        state.sharedFiles = { text: sharedFilesText(shared.outcomes), notes: shared.notes }
        // Files alone, and none of them could be read: nothing for Majnu to answer.
        if (!body.data.message && !shared.outcomes.some((outcome) => outcome.status === "read")) {
          if (shared.outcomes.some((outcome) => outcome.status === "failed")) out.emit({ type: "error", message: texts.files.failed })
          return
        }
      }

      const result = await runFinderTurn({ history: session.chat, message: body.data.message, state })

      // Append-only: what was loaded, then this turn's messages as the API saw them.
      if (result.appended.some((message) => message.role === "assistant")) {
        try {
          await saveFinderSession(session, {
            chat: [...session.chat, ...result.appended],
            context: state.context,
            lastOptions: state.lastOptions,
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
