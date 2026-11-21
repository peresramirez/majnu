// The one place that creates the Anthropic client and picks the model.
//
// The SDK already reads ANTHROPIC_BASE_URL (and ANTHROPIC_API_KEY) from the
// environment when the client is created, so an AI gateway can be put in front
// later by setting that variable, with no code change. We pass both explicitly
// anyway, so the behaviour does not depend on the SDK's defaults.
import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import type { AnthropicBeta, BetaThinkingConfigParam } from "@anthropic-ai/sdk/resources/beta"

export const DEFAULT_MODEL = "claude-opus-5-5"

// MAJNU_MODEL switches every agent at once (docs/plan.md: claude-sonnet-5-5 if
// replies feel slow or costs run high).
export function getModel(): string {
  return process.env.MAJNU_MODEL?.trim() || DEFAULT_MODEL
}

let client: Anthropic | undefined

// Created on first use rather than at import time: on Cloudflare Workers the
// environment is only populated once a request is being handled.
export function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseURL: process.env.ANTHROPIC_BASE_URL?.trim() || undefined,
      // Retries 408, 409, 429 and 5xx (overloaded included) with backoff.
      maxRetries: 2,
    })
  }
  return client
}

// Beta features every agent call uses:
// - thinking-binding-controls: lets us set block_binding below, so a change to a
//   system prompt or tool during the night drops old thinking blocks instead of
//   failing every conversation already in progress.
// - server-side-fallback: `fallbacks: "default"` re-runs a request the safety
//   classifiers decline on the model Anthropic recommends for that category.
export const AGENT_BETAS: AnthropicBeta[] = ["thinking-binding-controls-2026-08-01", "server-side-fallback-2026-07-01"]

// Thinking is always on for current models; effort is the control. A thinking
// budget or `disabled` is rejected.
export const AGENT_THINKING: BetaThinkingConfigParam = {
  type: "adaptive",
  block_binding: { prefix_mismatch_behavior: "drop_block" },
}

// Every agent runs at low effort (docs/plan.md). Callers put it in
// `output_config`, next to `format` when they need structured output.
export const AGENT_EFFORT = "low" as const

// Shared request fields. Do not add `temperature`, a thinking budget or a forced
// `tool_choice`: current models reject all three.
export function agentRequestBase() {
  return {
    model: getModel(),
    betas: AGENT_BETAS,
    thinking: AGENT_THINKING,
    fallbacks: "default" as const,
  }
}
