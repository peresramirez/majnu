// Turns failures into short messages for the sender (docs/brand.md voice: plain,
// no exclamation marks, say what to do next) and into log lines that carry no
// message text, gift codes or keys.
import Anthropic from "@anthropic-ai/sdk"

export const REFUSAL_MESSAGE = "I can't help with that one. Try saying it another way, or tell me about the gift you want to make."

export function friendlyError(error: unknown): string {
  if (error instanceof Anthropic.RateLimitError) {
    return "A lot of people are making gifts right now. Try again in a minute."
  }
  if (error instanceof Anthropic.InternalServerError) {
    // 500, 503, 529 overloaded: the SDK has already retried twice.
    return "We are very busy right now. Try again in a minute."
  }
  if (error instanceof Anthropic.APIConnectionError) {
    // Includes timeouts.
    return "The connection dropped. Try again."
  }
  return "Something went wrong writing the reply. Try again."
}

// Safe to log: the error class, HTTP status, request id and the API's own
// error text, which describes the request shape, not its content.
export function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Anthropic.APIError) {
    return { name: error.name, status: error.status, requestId: error.requestID, message: error.message }
  }
  if (error instanceof Error) {
    return { name: error.name, message: error.message }
  }
  return { error: String(error) }
}
