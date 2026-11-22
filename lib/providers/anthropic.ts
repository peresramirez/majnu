// The Anthropic side of the fallback keys (issue #67).
//
// 1. anthropicKeyFallback(): middleware for the one SDK client
//    (lib/agents/client.ts), so every agent call (main agent, builder,
//    research, finder, pools, notes, profile reading) switches keys in one
//    place without knowing it. It is installed only when
//    ANTHROPIC_API_KEY_FALLBACK is set; without it the client is exactly as
//    before. Per HTTP attempt:
//
//      primary answers normally, or with an ordinary error (a short 429, a
//      529, a 400 about the request)      → that answer; the SDK retries as before
//      primary refused for its key, billing, spend limit or tier threshold
//                                         → it cools off for 15 minutes (logged),
//                                           the same request goes out with the
//                                           fallback key, within the monthly cap
//      fallback refused too, cooling off, or the cap reached
//                                         → a 429 rate_limit_error with
//                                           x-should-retry: false, so the SDK
//                                           throws RateLimitError at once and the
//                                           routes show their friendly "busy" text
//
//    A fallback request reserves an upper bound of its cost first
//    (lib/providers/costs.ts), and settles with the usage the response reports:
//    read from the JSON body, or from a copy of the event stream that the SDK's
//    middleware context hands out without touching the caller's stream.
//
// 2. chooseSandboxAnthropicKey(): the key for Claude Code in the Daytona
//    sandbox, which calls Anthropic itself, out of our reach. With a fallback
//    set, the primary is first checked with a free token count, which answers
//    with the same refusals as a real request.
import "server-only"
import Anthropic, { type Middleware, type MiddlewareContext } from "@anthropic-ai/sdk"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { anthropicSwitchReason, type SwitchReason } from "./classify"
import { anthropicCostUsd, anthropicRequestShape, anthropicReserveUsd, type AnthropicUsage } from "./costs"
import { ProviderUnavailableError, type KeySlot } from "./fallback"
import { KEY_NAMES, coolOff, fallbackKey, isCoolingOff, logProviderEvent, readKey } from "./keys"
import { reserveFallbackSpend, settleFallbackSpend, type Reservation } from "./ledger"

type APIRequest = Parameters<Middleware>[0]

const PRIMARY = KEY_NAMES.anthropic.primary
const FALLBACK = KEY_NAMES.anthropic.fallback
// Statuses that can carry a "this key cannot be used" refusal.
const REFUSAL_STATUSES = new Set([400, 401, 402, 403, 429])

// ---------- 1. The SDK middleware ----------

export type MiddlewareDeps = {
  reserve: (usd: number) => Promise<Reservation | null>
  settle: (reservation: Reservation, costUsd: number) => Promise<void>
  // Keeps a settle running after the response is handed back (waitUntil on Workers).
  keepAlive: (work: Promise<unknown>) => void
}

const defaultDeps: MiddlewareDeps = {
  reserve: (usd) => reserveFallbackSpend("anthropic", usd),
  settle: settleFallbackSpend,
  keepAlive: (work) => {
    try {
      getCloudflareContext().ctx.waitUntil(work)
    } catch {
      // Not on Workers (next dev, scripts, tests): the process stays up anyway.
    }
  },
}

// Is ANTHROPIC_API_KEY_FALLBACK set (and not the primary itself)?
export function hasAnthropicFallback(): boolean {
  return fallbackKey("anthropic") !== undefined
}

export function anthropicKeyFallback(deps: Partial<MiddlewareDeps> = {}): Middleware {
  const { reserve, settle, keepAlive } = { ...defaultDeps, ...deps }

  return async (request, next, ctx) => {
    const fallback = fallbackKey("anthropic")
    // Token exchanges and a key removed since the client was made pass through.
    if (!fallback || !ctx.options) return next(request)

    const primarySkipped = isCoolingOff(PRIMARY)
    if (!primarySkipped) {
      const response = await next(request)
      const reason = await refusalOf(response, ctx)
      if (!reason) return response
      coolOff(PRIMARY, reason)
      logProviderEvent(`anthropic: ${PRIMARY} refused (${response.status} ${reason}, request ${response.headers.get("request-id") ?? "unknown"}); using ${FALLBACK} for the next 15 minutes`)
      await discard(response)
    }

    // The primary was skipped while cooling off and the fallback cannot help:
    // one more try with the primary, which may have recovered.
    const lastResort = async (why: string): Promise<Response> => {
      if (!primarySkipped) return busy(why)
      const response = await next(request)
      const reason = await refusalOf(response, ctx)
      if (!reason) return response
      coolOff(PRIMARY, reason)
      await discard(response)
      return busy(`${why}; ${PRIMARY} refused again (${reason})`)
    }

    if (isCoolingOff(FALLBACK)) return lastResort(`${FALLBACK} is cooling off`)

    // Only Messages requests cost money; token counts and model lists are free.
    const billed = isMessagesRequest(request)
    let reservation: Reservation | null = null
    if (billed) {
      reservation = await reserve(anthropicReserveUsd(anthropicRequestShape(request.body)))
      if (!reservation) return lastResort("the anthropic fallback cap is reached or could not be checked")
    }

    let response: Response
    try {
      response = await next(withKey(request, fallback))
    } catch (error) {
      // No response: nothing was billed. The SDK retries connection errors.
      if (reservation) await settle(reservation, 0)
      throw error
    }

    const reason = await refusalOf(response, ctx)
    if (reason) {
      coolOff(FALLBACK, reason)
      logProviderEvent(`anthropic: ${FALLBACK} refused too (${response.status} ${reason}, request ${response.headers.get("request-id") ?? "unknown"})`)
      if (reservation) await settle(reservation, 0)
      await discard(response)
      return busy(`${FALLBACK} refused (${reason})`)
    }
    if (!reservation) return response
    if (!response.ok) {
      // An ordinary error (a short rate limit, overloaded): not billed. The
      // SDK retries it, and the retry comes straight back to the fallback.
      await settle(reservation, 0)
      return response
    }

    const held = reservation
    const model = anthropicRequestShape(request.body).model
    keepAlive(
      usageOf(response, ctx)
        .catch(() => null)
        // An unfinished stream keeps its whole reservation: it may have been billed.
        .then((seen) => settle(held, seen ? anthropicCostUsd(seen.usage, model, seen.model) : held.usd)),
    )
    return response
  }
}

function isMessagesRequest(request: APIRequest): boolean {
  try {
    return (request.method ?? "GET").toUpperCase() === "POST" && new URL(request.url).pathname.endsWith("/v1/messages")
  } catch {
    return false
  }
}

// The same request with the fallback key in the header the SDK put the
// primary in (Authorization: Bearer in SDK 1.x, x-api-key in older ones).
function withKey(request: APIRequest, key: string): APIRequest {
  const headers = new Headers(request.headers)
  if (headers.has("x-api-key")) headers.set("x-api-key", key)
  else headers.set("authorization", `Bearer ${key}`)
  return { ...request, headers }
}

async function refusalOf(response: Response, ctx: MiddlewareContext): Promise<SwitchReason | null> {
  if (response.ok || !REFUSAL_STATUSES.has(response.status)) return null
  // ctx.parse reads a clone, so the SDK can still read the body.
  const body = await ctx.parse(response).catch(() => null)
  return anthropicSwitchReason(response.status, body)
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => {})
}

// What the SDK turns into Anthropic.RateLimitError, without retrying. The
// routes already answer that with their "busy, try again in a minute" text.
function busy(detail: string): Response {
  return new Response(
    JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: `No Anthropic key can be used right now: ${detail}` } }),
    { status: 429, headers: { "content-type": "application/json", "x-should-retry": "false" } },
  )
}

type StreamEvent = {
  type?: string
  message?: { model?: string; usage?: AnthropicUsage }
  usage?: AnthropicUsage
}

function present(usage: AnthropicUsage | undefined): AnthropicUsage {
  return Object.fromEntries(Object.entries(usage ?? {}).filter(([, value]) => value !== null && value !== undefined)) as AnthropicUsage
}

// The usage a successful response reports, or null if a stream ended early.
// Streams report it in message_start and, cumulatively, in message_delta.
async function usageOf(response: Response, ctx: MiddlewareContext): Promise<{ usage: AnthropicUsage; model?: string } | null> {
  if (!ctx.options?.stream) {
    const data = (await ctx.parse(response)) as { usage?: AnthropicUsage; model?: string } | null
    return data && typeof data === "object" && data.usage ? { usage: data.usage, model: data.model } : null
  }
  const events = (await ctx.parse(response)) as AsyncIterable<StreamEvent>
  let usage: AnthropicUsage = {}
  let model: string | undefined
  let complete = false
  for await (const event of events) {
    if (event.type === "message_start") {
      model = event.message?.model ?? model
      usage = { ...usage, ...present(event.message?.usage) }
    } else if (event.type === "message_delta") {
      usage = { ...usage, ...present(event.usage) }
    } else if (event.type === "message_stop") {
      complete = true
    }
  }
  return complete ? { usage, model } : null
}

// ---------- 2. The key for Claude Code in the Daytona sandbox ----------

export type SandboxKey = { key: string; slot: KeySlot; name: string }

// Why a key is refused, from a free token count, or null when it is usable
// (or the check itself failed for another reason, such as the network: then
// the run goes ahead with the key as before).
export type KeyCheck = (key: string, model: string) => Promise<SwitchReason | null>

export const checkAnthropicKey: KeyCheck = async (key, model) => {
  const client = new Anthropic({ apiKey: key, baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined, maxRetries: 0, timeout: 15_000 })
  try {
    await client.messages.countTokens({ model, messages: [{ role: "user", content: "ping" }] })
    return null
  } catch (error) {
    return error instanceof Anthropic.APIError && typeof error.status === "number" ? anthropicSwitchReason(error.status, error.error) : null
  }
}

// DAYTONA_ANTHROPIC_API_KEY (else ANTHROPIC_API_KEY), or
// ANTHROPIC_API_KEY_FALLBACK when that one is refused. Without a fallback key
// there is no check: the primary is used as before.
export async function chooseSandboxAnthropicKey(model: string, check: KeyCheck = checkAnthropicKey): Promise<SandboxKey> {
  const primaryName = readKey("DAYTONA_ANTHROPIC_API_KEY") ? "DAYTONA_ANTHROPIC_API_KEY" : PRIMARY
  const primary = readKey(primaryName)
  const fallback = fallbackKey("anthropic", process.env, primaryName)
  if (!fallback) {
    if (!primary) throw new ProviderUnavailableError("anthropic", "neither DAYTONA_ANTHROPIC_API_KEY nor ANTHROPIC_API_KEY is set")
    return { key: primary, slot: "primary", name: primaryName }
  }

  const tryPrimary = async (): Promise<SandboxKey | null> => {
    if (!primary) return null
    const reason = await check(primary, model)
    if (!reason) return { key: primary, slot: "primary", name: primaryName }
    coolOff(primaryName, reason)
    logProviderEvent(`anthropic (sandbox): ${primaryName} refused (${reason}); using ${FALLBACK} for the next 15 minutes`)
    return null
  }

  const primarySkipped = isCoolingOff(primaryName)
  if (!primarySkipped) {
    const chosen = await tryPrimary()
    if (chosen) return chosen
  }
  if (!isCoolingOff(FALLBACK)) {
    const reason = await check(fallback, model)
    if (!reason) return { key: fallback, slot: "fallback", name: FALLBACK }
    coolOff(FALLBACK, reason)
    logProviderEvent(`anthropic (sandbox): ${FALLBACK} refused too (${reason})`)
  }
  if (primarySkipped) {
    const chosen = await tryPrimary()
    if (chosen) return chosen
  }
  throw new ProviderUnavailableError("anthropic", `${primaryName} and ${FALLBACK} are both refused`)
}
