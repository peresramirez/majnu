// Conversations are stored and replayed exactly as the API returned them,
// append-only, thinking blocks included. The one rule the API sets on echoing a
// reply back concerns server-side fallbacks: when a model declined part-way
// through a reply and a fallback model continued it, the blocks the declining
// model wrote before the last `fallback` block must be left out (thinking,
// tool calls, and server tool calls without their result). Everything from the
// boundary on, and every text block, goes back unchanged. This is applied once,
// when the reply is first appended, so the stored history is never edited later.
import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta"

const DROPPED_BEFORE_FALLBACK = new Set(["thinking", "redacted_thinking", "tool_use"])

export function echoableContent(content: BetaContentBlock[]): BetaContentBlock[] {
  const boundary = content.map((block) => block.type).lastIndexOf("fallback")
  if (boundary <= 0) return content

  const resultIds = new Set<string>()
  for (const block of content) {
    if ("tool_use_id" in block && typeof block.tool_use_id === "string") resultIds.add(block.tool_use_id)
  }

  return content.filter((block, index) => {
    if (index >= boundary) return true
    if (DROPPED_BEFORE_FALLBACK.has(block.type)) return false
    if (block.type === "server_tool_use") return resultIds.has(block.id)
    return true
  })
}
