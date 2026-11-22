// Reads the newline-delimited JSON stream that POST /api/chat sends: one
// ChatEvent per line (see lib/agents/events.ts). Pure, so it can be tested
// without a browser; use-letter-chat.ts is the only caller in the app.
import type { ChatEvent } from "@/lib/agents/events"

// Splits buffered text into complete lines and the unfinished remainder.
// Blank lines are dropped and a trailing "\r" is removed, so CRLF streams work.
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const parts = buffer.split("\n")
  const rest = parts.pop() ?? ""
  const lines = parts.map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line)).filter((line) => line.trim() !== "")
  return { lines, rest }
}

const isString = (v: unknown): v is string => typeof v === "string"
const isArray = (v: unknown): v is unknown[] => Array.isArray(v)

// One line of the stream as a ChatEvent, or null when the line is not valid
// JSON, has an unknown `type`, or lacks the fields the UI reads. A bad line is
// skipped rather than ending the reply.
export function parseChatEvent(line: string): ChatEvent | null {
  let value: unknown
  try {
    value = JSON.parse(line)
  } catch {
    return null
  }
  if (!value || typeof value !== "object" || isArray(value)) return null
  const e = value as Record<string, unknown>
  switch (e.type) {
    case "letter":
      return isString(e.letterId) && e.letterId ? (e as ChatEvent) : null
    case "text":
      return isString(e.delta) ? (e as ChatEvent) : null
    case "tool":
      return isString(e.name) && isString(e.label) && (e.status === "start" || e.status === "done" || e.status === "error")
        ? (e as ChatEvent)
        : null
    case "templates":
      return isArray(e.ids) && e.ids.every(isString) ? (e as ChatEvent) : null
    case "gifts":
      return isArray(e.ideas) && e.ideas.every((idea) => !!idea && typeof idea === "object" && isString((idea as { title?: unknown }).title))
        ? (e as ChatEvent)
        : null
    case "draft":
      return isString(e.letterId) &&
        e.letterId &&
        (e.kind === "letter" || e.kind === "calendar") &&
        isString(e.templateId) &&
        !!e.content &&
        typeof e.content === "object" &&
        !isArray(e.content)
        ? (e as ChatEvent)
        : null
    case "preview":
      return isString(e.letterId) && e.letterId && isString(e.kind) && isString(e.templateId) ? (e as ChatEvent) : null
    case "limit":
      return isString(e.reason) && isString(e.message) ? (e as ChatEvent) : null
    case "refusal":
    case "error":
      return { type: e.type, message: isString(e.message) ? e.message : "" }
    case "done":
      return { type: "done" }
    default:
      return null
  }
}

// Yields each event as soon as its line is complete. Multi-byte characters
// split across chunks are decoded correctly, and a final line without a
// trailing newline is still read.
export async function* readChatEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
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
        const event = parseChatEvent(line)
        if (event) yield event
      }
    }
    finished = true
    buffer += decoder.decode()
    const last = buffer.trim()
    if (last) {
      const event = parseChatEvent(last)
      if (event) yield event
    }
  } finally {
    // The caller stopped early (or the read failed): stop the download too.
    if (!finished) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
