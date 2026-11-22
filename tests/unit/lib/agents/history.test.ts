import type { BetaContentBlock } from "@anthropic-ai/sdk/resources/beta"
import { describe, expect, it } from "vitest"
import { echoableContent } from "@/lib/agents/history"

const block = (b: Record<string, unknown>) => b as unknown as BetaContentBlock
const thinking = block({ type: "thinking", thinking: "", signature: "s" })
const fallback = block({ type: "fallback", from: { model: "a" }, to: { model: "b" }, trigger: {} })

describe("echoableContent", () => {
  it("returns a reply without a fallback unchanged", () => {
    const content = [thinking, block({ type: "text", text: "Hi" }), block({ type: "tool_use", id: "t", name: "x", input: {} })]
    expect(echoableContent(content)).toBe(content)
  })

  it("keeps a fallback that came before any output as it is", () => {
    const content = [fallback, thinking, block({ type: "text", text: "Hi" })]
    expect(echoableContent(content)).toBe(content)
  })

  it("drops thinking, tool calls and unanswered server tool calls before the last fallback", () => {
    const content = [
      thinking,
      block({ type: "server_tool_use", id: "s1", name: "web_search", input: {} }),
      block({ type: "web_search_tool_result", tool_use_id: "s1", content: [] }),
      block({ type: "server_tool_use", id: "s2", name: "web_search", input: {} }),
      block({ type: "text", text: "Dear " }),
      block({ type: "tool_use", id: "t", name: "x", input: {} }),
      fallback,
      thinking,
      block({ type: "text", text: "Anna" }),
    ]
    expect(echoableContent(content).map((b) => ("id" in b ? `${b.type}:${b.id}` : b.type))).toEqual([
      "server_tool_use:s1",
      "web_search_tool_result",
      "text",
      "fallback",
      "thinking",
      "text",
    ])
  })
})
