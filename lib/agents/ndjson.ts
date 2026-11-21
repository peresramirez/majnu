// Newline-delimited JSON for the chat stream (see lib/agents/events.ts).
// JSON.stringify escapes newlines inside strings, so each event is exactly one line.
import type { ChatEvent } from "./events"

export const NDJSON_CONTENT_TYPE = "application/x-ndjson; charset=utf-8"

export function encodeEvent(event: ChatEvent): string {
  return JSON.stringify(event) + "\n"
}

export type EventStream = {
  stream: ReadableStream<Uint8Array>
  emit: (event: ChatEvent) => void
  close: () => void
  // True once the client has gone away or close() was called.
  readonly closed: boolean
}

// A stream the route can write events to while the agent runs. Writes after the
// client disconnects are dropped instead of throwing, so the agent can finish
// its turn and save the conversation either way.
export function createEventStream(): EventStream {
  const encoder = new TextEncoder()
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined
  let closed = false

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c
    },
    cancel() {
      closed = true
    },
  })

  return {
    stream,
    emit(event) {
      if (closed || !controller) return
      try {
        controller.enqueue(encoder.encode(encodeEvent(event)))
      } catch {
        closed = true
      }
    },
    close() {
      if (closed) return
      closed = true
      try {
        controller?.close()
      } catch {
        // Already closed by the runtime.
      }
    },
    get closed() {
      return closed
    },
  }
}
