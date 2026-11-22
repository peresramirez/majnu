// Reads the newline-delimited JSON stream that POST /api/finder sends: one
// FinderEvent per line (see lib/finder/events.ts). Pure, so it can be tested
// without a browser or a network; transport.ts is the only caller in the app.
import type { FinderEvent, GiftOption } from "@/lib/finder/events"

// Splits buffered text into complete lines and the unfinished remainder.
// Blank lines are dropped and a trailing "\r" is removed, so CRLF streams work.
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n")
  const rest = parts.pop() ?? ""
  const lines = parts.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line)).filter((line) => line.trim() !== "")
  return { lines, rest }
}

const isString = (v: unknown): v is string => typeof v === "string"
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
const optionalString = (v: unknown) => v === undefined || isString(v)

const LIMIT_REASONS = new Set(["finder_daily", "personalise_daily", "session_full", "site_busy", "signin_required"])

function isGiftOption(v: unknown): v is GiftOption {
  if (!isRecord(v)) return false
  return (
    isString(v.id) &&
    v.id !== "" &&
    isString(v.title) &&
    isString(v.url) &&
    optionalString(v.description) &&
    optionalString(v.reason) &&
    optionalString(v.price) &&
    optionalString(v.imageUrl) &&
    optionalString(v.shop)
  )
}

// One line of the stream as a FinderEvent, or null when the line is not valid
// JSON, has an unknown `type`, or lacks the fields the finder reads. A bad line
// is skipped rather than ending the reply.
export function parseFinderEvent(line: string): FinderEvent | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (!isRecord(value)) return null
  const e = value
  switch (e.type) {
    case "session":
      return isString(e.sessionId) && e.sessionId ? { type: "session", sessionId: e.sessionId } : null
    case "text":
      return isString(e.delta) ? { type: "text", delta: e.delta } : null
    case "status":
      return isString(e.label) ? { type: "status", label: e.label } : null
    case "context":
      return isRecord(e.context) ? ({ type: "context", context: e.context } as FinderEvent) : null
    case "options": {
      if (!Array.isArray(e.options)) return null
      // Keep the options the cards can show; drop any the server got wrong.
      const options = e.options.filter(isGiftOption).map((o) => ({
        ...o,
        description: o.description ?? "",
        reason: o.reason ?? "",
      }))
      if (options.length === 0) return null
      const recommendedId = isString(e.recommendedId) ? e.recommendedId : ""
      return { type: "options", options, recommendedId, why: isString(e.why) ? e.why : "" }
    }
    case "question": {
      if (!isString(e.text)) return null
      const suggestions = Array.isArray(e.suggestions) ? e.suggestions.filter(isString).filter((s) => s.trim() !== "") : undefined
      return suggestions && suggestions.length ? { type: "question", text: e.text, suggestions } : { type: "question", text: e.text }
    }
    case "limit":
      return isString(e.reason) && LIMIT_REASONS.has(e.reason) && isString(e.message)
        ? ({ type: "limit", reason: e.reason, message: e.message } as FinderEvent)
        : null
    case "error":
      return { type: "error", message: isString(e.message) ? e.message : "" }
    case "done":
      return { type: "done" }
    default:
      return null
  }
}

// Yields each event as soon as its line is complete. Multi-byte characters
// split across chunks are decoded correctly, and a final line without a
// trailing newline is still read.
export async function* readFinderEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<FinderEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let finished = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const { lines, rest } = splitLines(buffer)
      buffer = rest
      for (const line of lines) {
        const event = parseFinderEvent(line)
        if (event) yield event
      }
    }
    finished = true
    buffer += decoder.decode()
    const last = buffer.trim()
    if (last) {
      const event = parseFinderEvent(last)
      if (event) yield event
    }
  } finally {
    // The caller stopped early (or the read failed): stop the download too.
    if (!finished) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
