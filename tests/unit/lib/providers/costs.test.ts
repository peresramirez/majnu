import { describe, expect, it } from "vitest"
import { anthropicRequestShape as shapeOf, IMAGE_TOKENS, PDF_PAGE_TOKENS } from "@/lib/providers/costs"
import {
  UNKNOWN_MODEL_PRICE,
  anthropicCostUsd,
  anthropicPrice,
  anthropicRequestShape,
  anthropicReserveUsd,
  daytonaCostUsd,
  transcriptionCostUsd,
  transcriptionReserveUsd,
} from "@/lib/providers/costs"

describe("anthropicCostUsd", () => {
  it("prices input and output at the model's published rate", () => {
    // Opus 5.5: $4 / $20 per million tokens.
    expect(anthropicCostUsd({ input_tokens: 1_000_000, output_tokens: 0 }, "claude-opus-5-5")).toBeCloseTo(4, 10)
    expect(anthropicCostUsd({ input_tokens: 0, output_tokens: 1_000_000 }, "claude-opus-5-5")).toBeCloseTo(20, 10)
    // Sonnet 5.5: $2 / $10.
    expect(anthropicCostUsd({ input_tokens: 2_000, output_tokens: 500 }, "claude-sonnet-5-5")).toBeCloseTo(0.004 + 0.005, 10)
  })

  it("prices cache reads at the model's cache rate and writes at 1.25x (5 minutes) or 2x (1 hour)", () => {
    expect(anthropicCostUsd({ cache_read_input_tokens: 1_000_000 }, "claude-opus-5-5")).toBeCloseTo(0.2, 10)
    expect(anthropicCostUsd({ cache_creation_input_tokens: 1_000_000 }, "claude-opus-5-5")).toBeCloseTo(5, 10)
    expect(
      anthropicCostUsd(
        { cache_creation_input_tokens: 1_000_000, cache_creation: { ephemeral_5m_input_tokens: 400_000, ephemeral_1h_input_tokens: 600_000 } },
        "claude-opus-5-5",
      ),
    ).toBeCloseTo(0.4 * 5 + 0.6 * 8, 10)
  })

  it("adds $10 per 1,000 web searches; web fetches cost only their tokens", () => {
    expect(anthropicCostUsd({ server_tool_use: { web_search_requests: 4, web_fetch_requests: 3 } }, "claude-opus-5-5")).toBeCloseTo(0.04, 10)
  })

  it("adds up a realistic finder turn", () => {
    const usage = {
      input_tokens: 1_200,
      cache_creation_input_tokens: 3_000,
      cache_read_input_tokens: 9_000,
      output_tokens: 850,
      server_tool_use: { web_search_requests: 2 },
    }
    const expected = (1_200 * 4 + 3_000 * 5 + 9_000 * 0.2 + 850 * 20) / 1_000_000 + 0.02
    expect(anthropicCostUsd(usage, "claude-opus-5-5")).toBeCloseTo(expected, 10)
  })

  it("ignores missing, null and negative counts", () => {
    expect(anthropicCostUsd({ input_tokens: null, output_tokens: -5, cache_creation: null, server_tool_use: null }, "claude-opus-5-5")).toBe(0)
  })

  it("prices an unknown model as the dearest, and uses the dearer of the asked and the answering model", () => {
    expect(anthropicPrice("claude-something-new")).toEqual(UNKNOWN_MODEL_PRICE)
    expect(anthropicPrice(undefined)).toEqual(UNKNOWN_MODEL_PRICE)
    const usage = { output_tokens: 1_000_000 }
    expect(anthropicCostUsd(usage, "claude-opus-5-5", "claude-opus-4-8")).toBeCloseTo(25, 10)
    expect(anthropicCostUsd(usage, "claude-opus-5-5", undefined)).toBeCloseTo(50, 10)
  })
})

describe("anthropicReserveUsd", () => {
  const body = JSON.stringify({
    model: "claude-opus-5-5",
    max_tokens: 16_000,
    messages: [{ role: "user", content: "Find a gift for my mother" }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }, { name: "report_gifts", input_schema: {} }],
  })

  it("reads the model, max_tokens, the body's length and the allowed searches", () => {
    expect(anthropicRequestShape(body)).toEqual({ model: "claude-opus-5-5", bodyChars: body.length, maxTokens: 16_000, webSearchUses: 4 })
    expect(anthropicRequestShape(JSON.stringify({ tools: [{ type: "web_search_20260209" }] })).webSearchUses).toBe(5)
    expect(anthropicRequestShape(undefined)).toEqual({ bodyChars: null, webSearchUses: 0 })
  })

  it("is an upper bound on what the call can report", () => {
    const shape = anthropicRequestShape(body)
    const reserve = anthropicReserveUsd(shape)
    // The most the call can come back with: every body character as a cache
    // write, all of max_tokens, every search with its results.
    const worst = anthropicCostUsd(
      { cache_creation_input_tokens: body.length + 4 * 30_000, output_tokens: 16_000, server_tool_use: { web_search_requests: 4 } },
      "claude-opus-5-5",
    )
    expect(reserve).toBeGreaterThanOrEqual(worst - 1e-12)
    // ...and is not absurd: about $0.32 output, $0.60 for search input, $0.04 for searches.
    expect(reserve).toBeLessThan(1.5)
  })

  it("prices a body it cannot read as 200,000 input tokens", () => {
    expect(anthropicReserveUsd({ bodyChars: null, webSearchUses: 0, maxTokens: 1, model: "claude-opus-5-5" })).toBeCloseTo((200_000 * 5 + 20) / 1_000_000, 10)
  })
})

describe("transcription", () => {
  it("prices gpt-transcribe at $0.0045 a minute and unknown models at $0.006", () => {
    expect(transcriptionCostUsd(60, "gpt-transcribe")).toBeCloseTo(0.0045, 10)
    expect(transcriptionCostUsd(30, "gpt-4o-mini-transcribe")).toBeCloseTo(0.0015, 10)
    expect(transcriptionCostUsd(60, "some-new-model")).toBeCloseTo(0.006, 10)
    expect(transcriptionCostUsd(-3, "gpt-transcribe")).toBe(0)
  })

  it("reserves more than the browser's length", () => {
    expect(transcriptionReserveUsd(50, "gpt-transcribe")).toBeCloseTo(transcriptionCostUsd(70, "gpt-transcribe"), 10)
    expect(transcriptionReserveUsd(50, "gpt-transcribe")).toBeGreaterThan(transcriptionCostUsd(50, "gpt-transcribe"))
  })
})

describe("daytonaCostUsd", () => {
  it("prices vCPU and memory per second, disk only past 5 GiB, with the margin", () => {
    const resources = { cpu: 1, memory: 2, disk: 3 }
    // (0.0504 + 2 * 0.0162) per hour, doubled for region and CPU tier.
    expect(daytonaCostUsd(3600, resources)).toBeCloseTo((0.0504 + 0.0324) * 2, 10)
    expect(daytonaCostUsd(90, resources)).toBeCloseTo(((0.0504 + 0.0324) * 2 * 90) / 3600, 10)
    expect(daytonaCostUsd(3600, { cpu: 0, memory: 0, disk: 15 })).toBeCloseTo(10 * 0.000108 * 2, 10)
  })

  it("costs a whole 20-minute TTL under 6 cents", () => {
    expect(daytonaCostUsd(20 * 60, { cpu: 1, memory: 2, disk: 3 })).toBeLessThan(0.06)
  })
})

describe("anthropicRequestShape with files", () => {
  const body = (blocks: unknown[]) => JSON.stringify({ model: "claude-opus-5-5", max_tokens: 1000, messages: [{ role: "user", content: blocks }] })

  it("prices a base64 photo as an image, not as its characters", () => {
    const data = "A".repeat(400_000)
    const shape = shapeOf(body([{ type: "image", source: { type: "base64", media_type: "image/jpeg", data } }]))
    expect(shape.bodyChars).toBeLessThan(2_000 + IMAGE_TOKENS)
    expect(shape.bodyChars).toBeGreaterThanOrEqual(IMAGE_TOKENS)
  })

  it("prices a base64 PDF by its estimated pages, at most 20", () => {
    const small = shapeOf(body([{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "A".repeat(60_000) } }]))
    expect(small.bodyChars).toBeGreaterThanOrEqual(PDF_PAGE_TOKENS)
    const huge = shapeOf(body([{ type: "document", source: { type: "base64", media_type: "application/pdf", data: "A".repeat(14_000_000) } }]))
    expect(huge.bodyChars).toBeLessThanOrEqual(20 * PDF_PAGE_TOKENS + 2_000)
  })

  it("still counts plain text by its characters", () => {
    const text = "x".repeat(5_000)
    expect(shapeOf(body([{ type: "text", text }])).bodyChars).toBeGreaterThan(5_000)
  })
})
