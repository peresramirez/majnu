// What one call costs, estimated from the providers' published prices, in US
// dollars. The fallback keys' cap (lib/providers/ledger.ts) adds these up.
//
// Two numbers per call:
// - a reservation before the call: an upper bound, so concurrent calls cannot
//   together slip past the cap. It is deliberately generous.
// - the cost after the call, from what the provider reported (tokens, billed
//   seconds, sandbox time). It replaces the reservation.
//
// Prices checked 22 November 2026:
// - Anthropic: the claude-api skill's model table (cached 2026-11-03) and
//   platform.claude.com pricing. Cache writes cost 1.25x input for the
//   5-minute TTL and 2x for the 1-hour TTL; web search is $10 per 1,000
//   searches; web fetch costs only its tokens.
// - OpenAI: developers.openai.com/api/docs/pricing, transcription per minute.
// - Daytona: daytona.io/pricing, per vCPU-hour and GiB-hour, billed per second.
//
// No imports and no secrets: pure functions, unit-tested
// (tests/unit/lib/providers/costs.test.ts).

const PER_MILLION = 1_000_000

// ---------- Anthropic ----------

// US dollars per million tokens.
export type ModelPrice = { input: number; output: number; cacheRead: number }

export const ANTHROPIC_PRICES: Record<string, ModelPrice> = {
  "claude-fable-5-2": { input: 8, output: 40, cacheRead: 0.2 },
  "claude-mythos-5-2": { input: 8, output: 40, cacheRead: 0.2 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-mythos-5-1": { input: 10, output: 50, cacheRead: 0.25 },
  "claude-fable-5": { input: 10, output: 50, cacheRead: 1 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-7": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-6": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheRead: 0.3 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheRead: 0.1 },
}

// A model missing from the table is priced as the most expensive one, so the
// cap errs on the side of stopping early.
export const UNKNOWN_MODEL_PRICE: ModelPrice = { input: 10, output: 50, cacheRead: 1 }

export const CACHE_WRITE_5M = 1.25
export const CACHE_WRITE_1H = 2
export const WEB_SEARCH_USD = 0.01

export function anthropicPrice(model: string | null | undefined): ModelPrice {
  return (model && ANTHROPIC_PRICES[model]) || UNKNOWN_MODEL_PRICE
}

// The usage object of a Messages API response (or the sum of a stream's
// message_start and message_delta usage). Every field may be missing or null.
export type AnthropicUsage = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
  cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null
  server_tool_use?: { web_search_requests?: number | null; web_fetch_requests?: number | null } | null
}

function count(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0
}

// The cost of one response. `models` are the model asked for and the model
// that answered: a server-side refusal fallback can answer on another model,
// so the dearer of the two is used.
export function anthropicCostUsd(usage: AnthropicUsage, ...models: Array<string | null | undefined>): number {
  const prices = models.length ? models.map(anthropicPrice) : [UNKNOWN_MODEL_PRICE]
  const price: ModelPrice = {
    input: Math.max(...prices.map((p) => p.input)),
    output: Math.max(...prices.map((p) => p.output)),
    cacheRead: Math.max(...prices.map((p) => p.cacheRead)),
  }
  const written = count(usage.cache_creation_input_tokens)
  const oneHour = Math.min(count(usage.cache_creation?.ephemeral_1h_input_tokens), written)
  // Without the split, a cache write is priced at the 5-minute TTL: the only
  // one this app asks for.
  const fiveMinutes = written - oneHour
  const tokens =
    count(usage.input_tokens) * price.input +
    fiveMinutes * price.input * CACHE_WRITE_5M +
    oneHour * price.input * CACHE_WRITE_1H +
    count(usage.cache_read_input_tokens) * price.cacheRead +
    count(usage.output_tokens) * price.output
  return tokens / PER_MILLION + count(usage.server_tool_use?.web_search_requests) * WEB_SEARCH_USD
}

// What a web search can add to the input beyond the request itself: its
// results are read back by the model. Generous on purpose.
export const WEB_SEARCH_INPUT_ALLOWANCE_TOKENS = 30_000
// A web search tool without max_uses, priced as this many searches.
export const DEFAULT_WEB_SEARCH_USES = 5
// A request body we cannot measure, priced as this many input tokens.
export const UNKNOWN_BODY_TOKENS = 200_000

// Files sent as base64 (finder uploads, issue #77) are priced by what the
// model is billed for, not by their characters: a base64 photo of a few
// hundred kilobytes would otherwise reserve dollars for a few seconds. An image
// is at most about 1,600 tokens once the API has scaled it; a PDF is billed
// per page (text plus a page image), about 3,000 tokens a page at most, and
// pages are estimated from the file's size (at least one, at most the
// finder's 20). Generous on purpose, like the rest of the reservation.
export const IMAGE_TOKENS = 1_600
export const PDF_PAGE_TOKENS = 3_000
export const PDF_BYTES_PER_PAGE = 50_000
export const PDF_MAX_PAGES = 20

type Base64Source = { type?: unknown; media_type?: unknown; data?: unknown }

// Characters of base64 file data in the request and the tokens they stand for.
function base64Files(messages: unknown): { chars: number; tokens: number } {
  let chars = 0
  let tokens = 0
  if (!Array.isArray(messages)) return { chars, tokens }
  for (const message of messages as Array<{ content?: unknown }>) {
    if (!Array.isArray(message?.content)) continue
    for (const block of message.content as Array<{ type?: unknown; source?: Base64Source }>) {
      const source = block?.source
      if (!source || source.type !== "base64" || typeof source.data !== "string") continue
      chars += source.data.length
      if (block.type === "image") tokens += IMAGE_TOKENS
      else {
        const bytes = Math.ceil((source.data.length * 3) / 4)
        const pages = Math.min(PDF_MAX_PAGES, Math.max(1, Math.ceil(bytes / PDF_BYTES_PER_PAGE)))
        tokens += pages * PDF_PAGE_TOKENS
      }
    }
  }
  return { chars, tokens }
}

export type AnthropicRequestShape = {
  model?: string
  // Characters in the JSON body. Every token is at least one character, so
  // this bounds the input tokens from above (images bound it far above).
  bodyChars: number | null
  maxTokens?: number
  webSearchUses: number
}

// Reads what the reservation needs from a Messages API request body.
export function anthropicRequestShape(body: unknown): AnthropicRequestShape {
  if (typeof body !== "string") return { bodyChars: null, webSearchUses: 0 }
  let parsed: { model?: unknown; max_tokens?: unknown; tools?: unknown; messages?: unknown } = {}
  try {
    parsed = JSON.parse(body) as typeof parsed
  } catch {
    // Not JSON: priced by its length alone.
  }
  let webSearchUses = 0
  if (Array.isArray(parsed.tools)) {
    for (const tool of parsed.tools as Array<{ type?: unknown; max_uses?: unknown }>) {
      if (typeof tool?.type === "string" && tool.type.startsWith("web_search")) {
        webSearchUses += typeof tool.max_uses === "number" && tool.max_uses > 0 ? tool.max_uses : DEFAULT_WEB_SEARCH_USES
      }
    }
  }
  const files = base64Files(parsed.messages)
  return {
    model: typeof parsed.model === "string" ? parsed.model : undefined,
    bodyChars: body.length - files.chars + files.tokens,
    maxTokens: typeof parsed.max_tokens === "number" && parsed.max_tokens > 0 ? parsed.max_tokens : undefined,
    webSearchUses,
  }
}

// The most one request can cost: every character of the body as an input
// token written to the cache, all of max_tokens as output, and each allowed
// web search with a page of results read back.
export function anthropicReserveUsd(shape: AnthropicRequestShape): number {
  const price = anthropicPrice(shape.model)
  const inputTokens = shape.bodyChars ?? UNKNOWN_BODY_TOKENS
  // max_tokens is required by the API; 64,000 stands in if it is missing.
  const outputTokens = shape.maxTokens ?? 64_000
  const searchInput = shape.webSearchUses * WEB_SEARCH_INPUT_ALLOWANCE_TOKENS
  return (
    ((inputTokens + searchInput) * price.input * CACHE_WRITE_5M + outputTokens * price.output) / PER_MILLION +
    shape.webSearchUses * WEB_SEARCH_USD
  )
}

// ---------- OpenAI transcription ----------

// US dollars per minute of audio.
export const TRANSCRIBE_PRICE_PER_MINUTE: Record<string, number> = {
  "gpt-transcribe": 0.0045,
  "gpt-4o-transcribe": 0.006,
  "gpt-4o-mini-transcribe": 0.003,
  "gpt-4o-transcribe-diarize": 0.006,
  "whisper-1": 0.006,
}
export const UNKNOWN_TRANSCRIBE_PRICE_PER_MINUTE = 0.006

export function transcriptionCostUsd(seconds: number, model: string): number {
  const perMinute = TRANSCRIBE_PRICE_PER_MINUTE[model] ?? UNKNOWN_TRANSCRIBE_PRICE_PER_MINUTE
  return (count(seconds) / 60) * perMinute
}

// Before the call only the browser's measure of the length is known: allow a
// fifth more and ten seconds on top.
export function transcriptionReserveUsd(seconds: number, model: string): number {
  return transcriptionCostUsd(count(seconds) * 1.2 + 10, model)
}

// ---------- Daytona ----------

export const DAYTONA_PRICES = {
  vcpuHour: 0.0504,
  memoryGiBHour: 0.0162,
  // Disk is free up to 5 GiB.
  diskGiBHour: 0.000108,
  freeDiskGiB: 5,
}

// The region's price multiplier and the CPU type's price tier are not
// published as numbers; this margin covers them.
export const DAYTONA_PRICE_MARGIN = 2

export type SandboxResources = { cpu: number; memory: number; disk: number }

export function daytonaCostUsd(seconds: number, resources: SandboxResources): number {
  const perHour =
    resources.cpu * DAYTONA_PRICES.vcpuHour +
    resources.memory * DAYTONA_PRICES.memoryGiBHour +
    Math.max(resources.disk - DAYTONA_PRICES.freeDiskGiB, 0) * DAYTONA_PRICES.diskGiBHour
  return (count(seconds) / 3600) * perHour * DAYTONA_PRICE_MARGIN
}
