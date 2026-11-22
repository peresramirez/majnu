// Which provider errors mean "this key cannot be used now", so the call moves
// to the fallback key, and which mean "wait a moment", so it does not.
//
// Switch only when waiting will not help:
// - the key is not accepted (authentication, permission);
// - the account cannot pay (billing, credit balance);
// - a spend limit or quota is reached until the month or the plan changes.
//
// A short rate limit (a 429 without one of these reasons), an overloaded API
// and every 5xx stay on the same key: the callers retry them as before.
//
// No imports: pure functions, unit-tested (tests/unit/lib/providers/classify.test.ts).

export type SwitchReason = "authentication" | "permission" | "billing" | "spend_limit" | "quota"

function errorPart(body: unknown): { type?: string; message?: string; errorCode?: string } {
  if (!body || typeof body !== "object") return {}
  const error = (body as { error?: unknown }).error
  if (!error || typeof error !== "object") return {}
  const { type, message, details } = error as { type?: unknown; message?: unknown; details?: unknown }
  const errorCode = details && typeof details === "object" ? (details as { error_code?: unknown }).error_code : undefined
  return {
    type: typeof type === "string" ? type : undefined,
    message: typeof message === "string" ? message : undefined,
    errorCode: typeof errorCode === "string" ? errorCode : undefined,
  }
}

// Anthropic: `body` is the error response as JSON,
// { type: "error", error: { type, message, details?: { error_code } } }
// (the SDK keeps it as APIError.error).
//
// Seen on our own key, 21 and 22 November 2026:
// - 429 rate_limit_error, details.error_code "enforced_spend_limit_reached":
//   "your organization has crossed its monthly API usage threshold, set based
//   on your organization's API tier" (and the same code for a monthly spend
//   cap). It comes with x-should-retry: true, but retries fail until the date
//   in the message.
// - 400 invalid_request_error "You have reached your specified API usage
//   limits": the spend limit set in the Console.
// Documented: 401 authentication_error, 402 billing_error, 403
// permission_error, and the older 400 "Your credit balance is too low".
export function anthropicSwitchReason(status: number, body: unknown): SwitchReason | null {
  const { type, message = "", errorCode } = errorPart(body)
  if (status === 401 || type === "authentication_error") return "authentication"
  if (status === 402 || type === "billing_error") return "billing"
  if (status === 403 || type === "permission_error") return "permission"
  if (status === 429 && errorCode === "enforced_spend_limit_reached") return "spend_limit"
  if (status === 400 && /reached your specified api usage limits/i.test(message)) return "spend_limit"
  if (status === 400 && /credit balance is too low/i.test(message)) return "billing"
  return null
}

// OpenAI: `code` is what lib/voice/openai.ts keeps of the error body, its
// error.code, error.type and error.param joined with "/" (never the message).
// - 401: invalid_api_key, or a revoked or deactivated key or account.
// - 429 insufficient_quota: "You exceeded your current quota, please check
//   your plan and billing details". An ordinary 429 is a rate limit.
// - billing_hard_limit_reached: the account's hard spend limit.
export function openaiSwitchReason(status: number, code: string): SwitchReason | null {
  if (status === 401) return "authentication"
  if (/insufficient_quota/.test(code)) return "quota"
  if (/billing_hard_limit_reached/.test(code)) return "billing"
  return null
}

// Daytona: the status, the body's `code` when there is one, and its message.
// - 401: the key is not accepted. 402: payment required.
// - 429 LIMIT_EXCEEDED: an organization limit (no Retry-After). RATE_LIMITED,
//   OVERLOADED and TOO_MANY_REQUESTS pass with time and do not switch.
// - A 4xx whose message speaks of quota, credits, billing, payment or a
//   suspended organization.
// "Network access is restricted and cannot be overridden" (the tier refusing
// a per-sandbox allow list) is not a key problem: lib/daytona/redesign.ts
// retries it without the list.
const DAYTONA_ACCOUNT_PROBLEM = /quota|insufficient (credit|fund|balance)|out of credit|no credit|billing|payment|suspended|wallet/i

export function daytonaSwitchReason(status: number, code: string | undefined, message: string): SwitchReason | null {
  if (status === 401) return "authentication"
  if (status === 402) return "billing"
  if (status === 429) {
    if (code === "LIMIT_EXCEEDED") return "quota"
    if (code && code !== "TOO_MANY_REQUESTS") return null
  }
  if (status >= 400 && status < 500 && DAYTONA_ACCOUNT_PROBLEM.test(message)) {
    return /quota|limit/i.test(message) ? "quota" : "billing"
  }
  return null
}
