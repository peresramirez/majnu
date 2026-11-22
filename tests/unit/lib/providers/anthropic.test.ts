import Anthropic from "@anthropic-ai/sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => { throw new Error("not on Workers") } }))
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => { throw new Error("no database in this test") } }))

import { friendlyError } from "@/lib/agents/errors"
import { anthropicKeyFallback, chooseSandboxAnthropicKey } from "@/lib/providers/anthropic"
import { anthropicCostUsd, anthropicRequestShape, anthropicReserveUsd } from "@/lib/providers/costs"
import { COOL_OFF_MS, isCoolingOff, resetCoolingOff } from "@/lib/providers/keys"
import type { Reservation } from "@/lib/providers/ledger"
import { sseBody } from "../agents/fake-stream"

const PRIMARY = "sk-ant-primary-test"
const FALLBACK = "sk-ant-fallback-test"

// What each key gets back, per request.
type Answer = "stream" | "json" | "tier_limit" | "console_limit" | "short_429" | "invalid_key" | "overloaded" | "cut_stream" | "count"

const recordedTierLimit = {
  type: "error",
  error: {
    type: "rate_limit_error",
    message:
      "You have reached your API usage limits: your organization has crossed its monthly API usage threshold, set based on your organization's API tier. You will regain access on 2026-12-01 at 00:00 UTC.",
    details: { error_code: "enforced_spend_limit_reached" },
  },
}

function answer(kind: Answer): Response {
  const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test", ...headers } })
  switch (kind) {
    case "stream":
      return new Response(sseBody({ content: [{ type: "text", text: "Here are three ideas." }], stop_reason: "end_turn" }), { headers: { "content-type": "text/event-stream" } })
    case "cut_stream": {
      const full = sseBody({ content: [{ type: "text", text: "Here are three ideas." }], stop_reason: "end_turn" })
      return new Response(full.slice(0, full.indexOf("event: message_delta")), { headers: { "content-type": "text/event-stream" } })
    }
    case "json":
      return json(200, {
        id: "msg_1",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 5000, server_tool_use: { web_search_requests: 2 } },
      })
    case "count":
      return json(200, { input_tokens: 3 })
    case "tier_limit":
      // As recorded on 22 November 2026: x-should-retry true, no retry-after.
      return json(429, recordedTierLimit, { "x-should-retry": "true" })
    case "console_limit":
      return json(400, { type: "error", error: { type: "invalid_request_error", message: "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC." } })
    case "short_429":
      return json(429, { type: "error", error: { type: "rate_limit_error", message: "Number of request tokens has exceeded your per-minute rate limit" } }, { "retry-after-ms": "5" })
    case "invalid_key":
      return json(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } })
    case "overloaded":
      return json(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, { "retry-after-ms": "5" })
  }
}

type Sent = { key: string; path: string }

function setup(answers: Record<string, Answer | Answer[]>, opts: { reserve?: (usd: number) => Promise<Reservation | null> } = {}) {
  const sent: Sent[] = []
  const queues = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, Array.isArray(v) ? [...v] : v]))
  const fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const key = (headers.get("authorization") ?? "").replace(/^Bearer /, "") || headers.get("x-api-key") || ""
    sent.push({ key, path: new URL(String(url)).pathname })
    const queue = queues[key]
    if (!queue) throw new Error(`a request went out with an unexpected key`)
    const kind = Array.isArray(queue) ? (queue.length > 1 ? queue.shift()! : queue[0]) : queue
    return answer(kind)
  })
  const reservations: number[] = []
  const settled: Array<{ reservation: Reservation; cost: number }> = []
  const pending: Promise<unknown>[] = []
  const reserve = vi.fn(
    opts.reserve ??
      (async (usd: number) => {
        reservations.push(usd)
        return { provider: "anthropic" as const, month: "2026-11-01", usd }
      }),
  )
  const settle = vi.fn(async (reservation: Reservation, cost: number) => {
    settled.push({ reservation, cost })
  })
  const client = new Anthropic({
    apiKey: PRIMARY,
    maxRetries: 2,
    fetch,
    middleware: [anthropicKeyFallback({ reserve, settle, keepAlive: (work) => pending.push(work) })],
  })
  return { client, sent, fetch, reserve, settle, reservations, settled, flush: () => Promise.all(pending) }
}

const BODY = {
  model: "claude-opus-5-5",
  max_tokens: 4096,
  messages: [{ role: "user" as const, content: "Find a gift for my mother" }],
}

let warnings: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetCoolingOff()
  vi.stubEnv("ANTHROPIC_API_KEY", PRIMARY)
  vi.stubEnv("ANTHROPIC_API_KEY_FALLBACK", FALLBACK)
  vi.stubEnv("DAYTONA_ANTHROPIC_API_KEY", "")
  warnings = vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const logged = () => warnings.mock.calls.flat().join("\n")

describe("anthropicKeyFallback middleware", () => {
  it("leaves a working primary alone and counts nothing", async () => {
    const { client, sent, reserve } = setup({ [PRIMARY]: "stream" })
    const message = await client.messages.stream(BODY).finalMessage()
    expect(message.content).toEqual([expect.objectContaining({ type: "text", text: "Here are three ideas." })])
    expect(sent).toEqual([{ key: PRIMARY, path: "/v1/messages" }])
    expect(reserve).not.toHaveBeenCalled()
  })

  it("moves a stream refused for the tier threshold to the fallback key, and settles its cost from the stream's usage", async () => {
    const { client, sent, reservations, settled, flush } = setup({ [PRIMARY]: "tier_limit", [FALLBACK]: "stream" })
    const stream = client.messages.stream(BODY)
    let text = ""
    for await (const event of stream) if (event.type === "content_block_delta" && event.delta.type === "text_delta") text += event.delta.text
    expect(text).toBe("Here are three ideas.")
    // One refused primary request, no SDK retries of it, then the fallback.
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, FALLBACK])
    // Reserved the upper bound for this body, settled with what the stream reported.
    expect(reservations).toHaveLength(1)
    // (The SDK's body also carries "stream": true.)
    expect(reservations[0]).toBeGreaterThanOrEqual(anthropicReserveUsd(anthropicRequestShape(JSON.stringify(BODY))))
    expect(reservations[0]).toBeCloseTo(anthropicReserveUsd(anthropicRequestShape(JSON.stringify(BODY))), 3)
    await flush()
    expect(settled).toHaveLength(1)
    // message_start: 10 input; message_delta: 100 output (cumulative).
    expect(settled[0].cost).toBeCloseTo(anthropicCostUsd({ input_tokens: 10, output_tokens: 100 }, "claude-opus-5-5"), 12)
    expect(logged()).toMatch(/anthropic: ANTHROPIC_API_KEY refused \(429 spend_limit, request req_test\); using ANTHROPIC_API_KEY_FALLBACK for the next 15 minutes/)
    expect(logged()).not.toContain(FALLBACK)
    expect(logged()).not.toContain(PRIMARY)
  })

  it("does the same for a non-streamed call refused for the Console spend limit, pricing its JSON usage", async () => {
    const { client, sent, settled, flush } = setup({ [PRIMARY]: "console_limit", [FALLBACK]: "json" })
    const message = await client.messages.create(BODY)
    expect(message.content[0]).toMatchObject({ type: "text", text: "ok" })
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, FALLBACK])
    await flush()
    expect(settled[0].cost).toBeCloseTo((1000 * 4 + 200 * 20 + 5000 * 0.2) / 1e6 + 0.02, 12)
  })

  it("keeps a short rate limit on the primary key: the SDK retries it as before", async () => {
    const { client, sent, reserve } = setup({ [PRIMARY]: ["short_429", "short_429", "stream"] })
    await client.messages.stream(BODY).finalMessage()
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, PRIMARY, PRIMARY])
    expect(reserve).not.toHaveBeenCalled()
    expect(isCoolingOff("ANTHROPIC_API_KEY")).toBe(false)
  })

  it("keeps overload on the primary key too", async () => {
    const { client, sent } = setup({ [PRIMARY]: ["overloaded", "stream"] })
    await client.messages.stream(BODY).finalMessage()
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, PRIMARY])
  })

  it("answers with a RateLimitError at once when the fallback is refused too, so the routes show the busy message", async () => {
    const { client, sent, settled } = setup({ [PRIMARY]: "tier_limit", [FALLBACK]: "invalid_key" })
    const error = await client.messages.stream(BODY).finalMessage().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Anthropic.RateLimitError)
    expect(friendlyError(error)).toBe("A lot of people are making gifts right now. Try again in a minute.")
    // No retries of a busy answer.
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, FALLBACK])
    // The fallback's reservation released, and the fallback cooling off too.
    expect(settled).toEqual([{ reservation: expect.anything(), cost: 0 }])
    expect(isCoolingOff("ANTHROPIC_API_KEY_FALLBACK")).toBe(true)
    expect(logged()).toMatch(/ANTHROPIC_API_KEY_FALLBACK refused too \(401 authentication/)
  })

  it("refuses with the busy answer when the fallback's cap is reached, without calling the fallback", async () => {
    const { client, sent } = setup({ [PRIMARY]: "tier_limit", [FALLBACK]: "stream" }, { reserve: async () => null })
    const error = await client.messages.create(BODY).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Anthropic.RateLimitError)
    expect((error as Error).message).toMatch(/fallback cap is reached/)
    expect(sent.map((s) => s.key)).toEqual([PRIMARY])
  })

  it("goes straight to the fallback while the primary cools off, then back to the primary after 15 minutes", async () => {
    const now = vi.spyOn(Date, "now")
    const t0 = Date.parse("2026-11-22T20:00:00Z")
    now.mockReturnValue(t0)
    const { client, sent } = setup({ [PRIMARY]: ["tier_limit", "stream"], [FALLBACK]: "stream" })
    await client.messages.stream(BODY).finalMessage()
    await client.messages.stream(BODY).finalMessage()
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, FALLBACK, FALLBACK])
    now.mockReturnValue(t0 + COOL_OFF_MS)
    await client.messages.stream(BODY).finalMessage()
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, FALLBACK, FALLBACK, PRIMARY])
  })

  it("retries an overloaded fallback on the fallback, releasing each attempt's reservation", async () => {
    const { client, sent, settled, flush } = setup({ [PRIMARY]: "tier_limit", [FALLBACK]: ["overloaded", "stream"] })
    await client.messages.stream(BODY).finalMessage()
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, FALLBACK, FALLBACK])
    await flush()
    expect(settled.map((s) => s.cost > 0)).toEqual([false, true])
  })

  it("keeps the whole reservation for a stream that ended early: it may have been billed", async () => {
    const { client, settled, flush } = setup({ [PRIMARY]: "tier_limit", [FALLBACK]: "cut_stream" })
    await client.messages.stream(BODY).finalMessage().catch(() => null)
    await flush()
    expect(settled).toHaveLength(1)
    expect(settled[0].cost).toBe(settled[0].reservation.usd)
  })

  it("switches keys for free requests such as token counts without counting them", async () => {
    const { client, sent, reserve } = setup({ [PRIMARY]: "tier_limit", [FALLBACK]: "count" })
    await expect(client.messages.countTokens({ model: "claude-opus-5-5", messages: BODY.messages })).resolves.toEqual({ input_tokens: 3 })
    expect(sent).toEqual([
      { key: PRIMARY, path: "/v1/messages/count_tokens" },
      { key: FALLBACK, path: "/v1/messages/count_tokens" },
    ])
    expect(reserve).not.toHaveBeenCalled()
  })

  it("does nothing once the fallback key is removed", async () => {
    const { client, sent } = setup({ [PRIMARY]: "tier_limit" })
    vi.stubEnv("ANTHROPIC_API_KEY_FALLBACK", "")
    const error = await client.messages.create(BODY).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Anthropic.RateLimitError)
    // As without the middleware: the SDK obeys x-should-retry: true and retries twice.
    expect(sent.map((s) => s.key)).toEqual([PRIMARY, PRIMARY, PRIMARY])
  })
})

describe("getClient", () => {
  it("has no middleware without a fallback key, and the fallback middleware with one", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY_FALLBACK", "")
    vi.resetModules()
    const without = (await import("@/lib/agents/client")).getClient()
    expect(without.middleware).toHaveLength(0)

    vi.stubEnv("ANTHROPIC_API_KEY_FALLBACK", FALLBACK)
    vi.resetModules()
    const withFallback = (await import("@/lib/agents/client")).getClient()
    expect(withFallback.middleware).toHaveLength(1)
  })
})

describe("chooseSandboxAnthropicKey", () => {
  const MODEL = "claude-opus-5-5"

  it("uses the primary without any check when there is no fallback key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY_FALLBACK", "")
    const check = vi.fn()
    await expect(chooseSandboxAnthropicKey(MODEL, check)).resolves.toEqual({ key: PRIMARY, slot: "primary", name: "ANTHROPIC_API_KEY" })
    expect(check).not.toHaveBeenCalled()
  })

  it("prefers DAYTONA_ANTHROPIC_API_KEY as the primary", async () => {
    vi.stubEnv("DAYTONA_ANTHROPIC_API_KEY", "sk-ant-sandbox-test")
    const check = vi.fn(async () => null)
    await expect(chooseSandboxAnthropicKey(MODEL, check)).resolves.toEqual({ key: "sk-ant-sandbox-test", slot: "primary", name: "DAYTONA_ANTHROPIC_API_KEY" })
    expect(check).toHaveBeenCalledWith("sk-ant-sandbox-test", MODEL)
  })

  it("uses the fallback when the free check shows the primary refused, and remembers it", async () => {
    const check = vi.fn(async (key: string) => (key === PRIMARY ? ("spend_limit" as const) : null))
    await expect(chooseSandboxAnthropicKey(MODEL, check)).resolves.toEqual({ key: FALLBACK, slot: "fallback", name: "ANTHROPIC_API_KEY_FALLBACK" })
    expect(isCoolingOff("ANTHROPIC_API_KEY")).toBe(true)
    check.mockClear()
    await chooseSandboxAnthropicKey(MODEL, check)
    expect(check.mock.calls.map((c) => c[0])).toEqual([FALLBACK])
  })

  it("throws when both keys are refused", async () => {
    const check = vi.fn(async () => "authentication" as const)
    await expect(chooseSandboxAnthropicKey(MODEL, check)).rejects.toThrow(/ANTHROPIC_API_KEY and ANTHROPIC_API_KEY_FALLBACK are both refused/)
  })
})
