import { describe, expect, it } from "vitest"
import { anthropicSwitchReason, daytonaSwitchReason, openaiSwitchReason } from "@/lib/providers/classify"

const anthropicError = (type: string, message: string, errorCode?: string) => ({
  type: "error",
  error: { type, message, ...(errorCode ? { details: { error_code: errorCode } } : {}) },
})

describe("anthropicSwitchReason", () => {
  it("switches on the tier threshold our key hit (429 enforced_spend_limit_reached)", () => {
    // The body recorded on 22 November 2026.
    const body = anthropicError(
      "rate_limit_error",
      "You have reached your API usage limits: your organization has crossed its monthly API usage threshold, set based on your organization's API tier. You will regain access on 2026-12-01 at 00:00 UTC.",
      "enforced_spend_limit_reached",
    )
    expect(anthropicSwitchReason(429, body)).toBe("spend_limit")
  })

  it("switches on the Console spend limit (400 'specified API usage limits') and a low credit balance", () => {
    expect(
      anthropicSwitchReason(400, anthropicError("invalid_request_error", "You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC.")),
    ).toBe("spend_limit")
    expect(anthropicSwitchReason(400, anthropicError("invalid_request_error", "Your credit balance is too low to access the Anthropic API."))).toBe("billing")
  })

  it("switches on authentication, billing and permission errors", () => {
    expect(anthropicSwitchReason(401, anthropicError("authentication_error", "invalid x-api-key"))).toBe("authentication")
    expect(anthropicSwitchReason(401, null)).toBe("authentication")
    expect(anthropicSwitchReason(402, anthropicError("billing_error", "Payment required"))).toBe("billing")
    expect(anthropicSwitchReason(403, anthropicError("permission_error", "Not allowed"))).toBe("permission")
  })

  it("does not switch on a short rate limit, overload, server errors or a bad request", () => {
    expect(anthropicSwitchReason(429, anthropicError("rate_limit_error", "Number of request tokens has exceeded your per-minute rate limit"))).toBeNull()
    expect(anthropicSwitchReason(429, anthropicError("rate_limit_error", "slow down", "some_other_code"))).toBeNull()
    expect(anthropicSwitchReason(429, null)).toBeNull()
    expect(anthropicSwitchReason(529, anthropicError("overloaded_error", "Overloaded"))).toBeNull()
    expect(anthropicSwitchReason(500, anthropicError("api_error", "Internal error"))).toBeNull()
    expect(anthropicSwitchReason(400, anthropicError("invalid_request_error", "messages: roles must alternate"))).toBeNull()
    expect(anthropicSwitchReason(404, anthropicError("not_found_error", "model not found"))).toBeNull()
  })
})

describe("openaiSwitchReason", () => {
  // `code` as lib/voice/openai.ts keeps it: code/type/param joined with "/".
  it("switches on an invalid key and on insufficient quota", () => {
    expect(openaiSwitchReason(401, "invalid_api_key/invalid_request_error")).toBe("authentication")
    expect(openaiSwitchReason(401, "")).toBe("authentication")
    expect(openaiSwitchReason(429, "insufficient_quota/insufficient_quota")).toBe("quota")
    expect(openaiSwitchReason(400, "billing_hard_limit_reached/invalid_request_error")).toBe("billing")
  })

  it("does not switch on a rate limit, a bad request or a server error", () => {
    expect(openaiSwitchReason(429, "rate_limit_exceeded/requests")).toBeNull()
    expect(openaiSwitchReason(429, "")).toBeNull()
    expect(openaiSwitchReason(400, "unsupported_language/invalid_request_error/language")).toBeNull()
    expect(openaiSwitchReason(500, "server_error")).toBeNull()
    expect(openaiSwitchReason(0, "timeout")).toBeNull()
  })
})

describe("daytonaSwitchReason", () => {
  it("switches on an unaccepted key, payment required and an organization limit", () => {
    expect(daytonaSwitchReason(401, undefined, "Unauthorized")).toBe("authentication")
    expect(daytonaSwitchReason(402, undefined, "Payment required")).toBe("billing")
    expect(daytonaSwitchReason(429, "LIMIT_EXCEEDED", "organization limit max_concurrent_vms reached")).toBe("quota")
  })

  it("switches on a 4xx about quota, credits, billing or a suspended organization", () => {
    expect(daytonaSwitchReason(403, undefined, "Total CPU quota exceeded. Maximum allowed: 10")).toBe("quota")
    expect(daytonaSwitchReason(403, undefined, "Organization is suspended: insufficient credits")).toBe("billing")
    expect(daytonaSwitchReason(400, undefined, "Out of credits. Top up your wallet")).toBe("billing")
  })

  it("does not switch on rate limits, overload, the tier's network policy or server errors", () => {
    expect(daytonaSwitchReason(429, "RATE_LIMITED", "request rate limit exceeded; retry after the indicated delay")).toBeNull()
    expect(daytonaSwitchReason(429, "OVERLOADED", "the sandbox creation queue is at capacity")).toBeNull()
    expect(daytonaSwitchReason(403, undefined, "Network access is restricted and cannot be overridden for this tier")).toBeNull()
    expect(daytonaSwitchReason(404, undefined, "Sandbox not found")).toBeNull()
    expect(daytonaSwitchReason(500, undefined, "billing service unavailable")).toBeNull()
  })
})
