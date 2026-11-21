// The finder's NDJSON stream, built on the chat's (lib/agents/ndjson.ts). That
// one is typed for ChatEvent; the encoding is the same JSON.stringify per line,
// so only the event type differs.
import type { ChatEvent } from "@/lib/agents/events"
import { createEventStream } from "@/lib/agents/ndjson"
import type { FinderEvent } from "./events"

export { NDJSON_CONTENT_TYPE } from "@/lib/agents/ndjson"

export type FinderStream = {
  stream: ReadableStream<Uint8Array>
  emit: (event: FinderEvent) => void
  close: () => void
  readonly closed: boolean
}

export function createFinderStream(): FinderStream {
  const out = createEventStream()
  return {
    stream: out.stream,
    emit: (event) => out.emit(event as unknown as ChatEvent),
    close: () => out.close(),
    get closed() {
      return out.closed
    },
  }
}

