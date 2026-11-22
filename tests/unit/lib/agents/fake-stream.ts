// A recorded Messages API stream, replayed as server-sent events through a
// fake fetch. Tests that use it run the real SDK: its stream, its structured
// output parsing and the zod validation, with no network and no model.
import Anthropic from "@anthropic-ai/sdk"

export type ScriptedBlock = { type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown }

export type ScriptedReply = {
  content: ScriptedBlock[]
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "refusal"
  // Characters per delta, as the API sends text in small pieces.
  chunk?: number
}

// What one request gets back: a reply to stream, or an HTTP error.
export type Scripted = ScriptedReply | { status: number; type: string; message: string }

export function chunksOf(text: string, size: number): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size))
  return out
}

function sse(type: string, data: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`
}

export function sseBody(reply: ScriptedReply): string {
  const size = reply.chunk ?? 12
  const parts = [
    sse("message_start", {
      message: {
        id: "msg_test",
        type: "message",
        role: "assistant",
        model: "claude-opus-5-5",
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 },
      },
    }),
  ]
  reply.content.forEach((block, index) => {
    if (block.type === "text") {
      parts.push(sse("content_block_start", { index, content_block: { type: "text", text: "" } }))
      for (const piece of chunksOf(block.text, size)) {
        parts.push(sse("content_block_delta", { index, delta: { type: "text_delta", text: piece } }))
      }
    } else {
      parts.push(sse("content_block_start", { index, content_block: { type: "tool_use", id: block.id, name: block.name, input: {} } }))
      for (const piece of chunksOf(JSON.stringify(block.input), size)) {
        parts.push(sse("content_block_delta", { index, delta: { type: "input_json_delta", partial_json: piece } }))
      }
    }
    parts.push(sse("content_block_stop", { index }))
  })
  parts.push(sse("message_delta", { delta: { stop_reason: reply.stop_reason, stop_sequence: null }, usage: { output_tokens: 100 } }))
  parts.push(sse("message_stop", {}))
  return parts.join("")
}

// A real client whose every request is answered by `next`. The request bodies
// are pushed to `requests` as sent.
export function fakeClient(next: (body: Record<string, unknown>) => Scripted, requests: Array<Record<string, unknown>> = []): Anthropic {
  return new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      requests.push(body)
      const scripted = next(body)
      if ("status" in scripted) {
        return new Response(JSON.stringify({ type: "error", error: { type: scripted.type, message: scripted.message } }), {
          status: scripted.status,
          headers: { "content-type": "application/json" },
        })
      }
      return new Response(sseBody(scripted), { headers: { "content-type": "text/event-stream" } })
    },
  })
}
