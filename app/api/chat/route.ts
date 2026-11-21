// POST /api/chat: one message from the sender, answered by the main agent as a
// stream of newline-delimited ChatEvents (lib/agents/events.ts), always ending
// with `done`.
//
// Before the stream starts, failures are plain HTTP errors with a JSON body
// { error }: 400 bad body, 401 no session, 404 not your letter, 500 the letter
// could not be created. Once it starts, everything is an event.
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import * as z from "zod/v4"
import { resolveTimezone } from "@/lib/agents/context"
import { describeError } from "@/lib/agents/errors"
import type { ChatEvent } from "@/lib/agents/events"
import { runMainAgent } from "@/lib/agents/main"
import { NDJSON_CONTENT_TYPE, createEventStream } from "@/lib/agents/ndjson"
import type { TurnState } from "@/lib/agents/tools"
import { createLetter, getMyLetter, saveChat } from "@/lib/letters/store"
import { canCreateLetter, canSendChatTurn } from "@/lib/limits"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

// Part of the spending guard: one message cannot carry a whole book.
export const MAX_MESSAGE_LENGTH = 4000

const ChatRequestBody = z.object({
  letterId: z.string().min(1).max(100).optional(),
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  timezone: z.string().max(64).optional(),
})

const NO_STORE = { "Cache-Control": "no-store" }

function jsonError(status: number, error: string): Response {
  return Response.json({ error }, { status, headers: NO_STORE })
}

function eventResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: { ...NO_STORE, "Content-Type": NDJSON_CONTENT_TYPE, "X-Content-Type-Options": "nosniff" },
  })
}

// A stream that is already complete, for answers that need no model call.
function fixedEvents(events: ChatEvent[]): Response {
  const out = createEventStream()
  for (const event of events) out.emit(event)
  out.emit({ type: "done" })
  out.close()
  return eventResponse(out.stream)
}

// Keeps the Worker alive until the turn is finished and saved, even if the
// sender closes the page: a letter built without its conversation saved would
// leave the agent not knowing about it next time.
function keepRunning(work: Promise<void>): void {
  try {
    getCloudflareContext().ctx.waitUntil(work)
  } catch {
    // Not running on Workers (next dev, tests): the process stays up anyway.
  }
}

function shareUrlFor(request: Request, slug: string): string {
  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || new URL(request.url).origin
  return `${origin}/l/${slug}`
}

export async function POST(request: Request): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return jsonError(401, "Sign in to keep going.")

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return jsonError(400, "Something went wrong sending the message. Try again.")
  }
  const body = ChatRequestBody.safeParse(raw)
  if (!body.success) {
    const tooLong = body.error.issues.some((issue) => issue.path[0] === "message" && issue.code === "too_big")
    return jsonError(400, tooLong ? "That message is too long. Try a shorter one." : "Write a message first.")
  }

  const now = new Date()
  const timezone = resolveTimezone(body.data.timezone)
  const out = createEventStream()

  let letterId: string
  let chat: BetaMessageParam[]
  let letter: TurnState["letter"]
  let shareUrl: string | null
  let isNew = false

  try {
    if (body.data.letterId) {
      const existing = await getMyLetter(body.data.letterId)
      if (!existing) return jsonError(404, "This gift was not found.")
      letterId = existing.id
      // Stored exactly as the API returned it; replayed as it is.
      chat = Array.isArray(existing.chat) ? (existing.chat as BetaMessageParam[]) : []
      letter = { kind: existing.kind, templateId: existing.templateId, content: existing.content }
      shareUrl = existing.slug ? shareUrlFor(request, existing.slug) : null
    } else {
      const allowed = await canCreateLetter()
      if (!allowed.ok) return fixedEvents([{ type: "limit", reason: allowed.reason, message: allowed.message }])
      const created = await createLetter()
      letterId = created.id
      chat = []
      letter = { kind: null, templateId: null, content: null }
      shareUrl = shareUrlFor(request, created.slug)
      isNew = true
    }
  } catch (error) {
    console.error("[chat] could not load or create the letter", describeError(error))
    return jsonError(500, "Something went wrong loading the gift. Try again.")
  }

  const state: TurnState = { letterId, shareUrl, now, timezone, emit: out.emit, letter }

  // The rest runs while the response streams. Waiting on the model does not
  // count against the Worker's CPU limit; this code does, so it stays small.
  const turnWork = (async () => {
    try {
      // First, so the client can move to /create/<id> while the reply streams.
      if (isNew) out.emit({ type: "letter", letterId })

      const turn = await canSendChatTurn(letterId)
      if (!turn.ok) {
        out.emit({ type: "limit", reason: turn.reason, message: turn.message })
        return
      }

      const result = await runMainAgent({ history: chat, message: body.data.message, state })

      // Append-only: what was loaded, then this turn's messages as the API saw them.
      if (result.appended.some((m) => m.role === "assistant")) {
        try {
          await saveChat(letterId, [...chat, ...result.appended])
        } catch (error) {
          console.error("[chat] could not save the conversation", describeError(error))
          out.emit({ type: "error", message: "Something went wrong saving this conversation. Try again." })
        }
      }
    } catch (error) {
      console.error("[chat] turn failed", describeError(error))
      out.emit({ type: "error", message: "Something went wrong. Try again." })
    } finally {
      out.emit({ type: "done" })
      out.close()
    }
  })()
  keepRunning(turnWork)

  return eventResponse(out.stream)
}
