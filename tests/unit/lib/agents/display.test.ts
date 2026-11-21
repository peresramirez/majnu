import { describe, expect, it } from "vitest"
import { toDisplayMessages } from "@/lib/agents/display"

const context = { type: "text", text: "<context>Today is Saturday 2026-11-21 in Europe/Berlin (UTC+01:00). The sender's timezone is Europe/Berlin.</context>" }

const idea = { title: "Pottery class for two", reason: "She loves making things with her hands.", price: "€45", url: "https://example.com/pottery" }

// A conversation shaped like what the API returns and the route stores.
const chat = [
  { role: "user", content: [context, { type: "text", text: "Hi, a birthday letter for my sister Anna" }] },
  {
    role: "assistant",
    content: [
      { type: "text", text: "Lovely." },
      { type: "tool_use", id: "t1", name: "suggest_templates", input: { templateIds: ["classic-envelope", "postcard", "not-a-template"] } },
    ],
  },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "The cards are showing. Wait for the sender to choose." }] },
  {
    role: "assistant",
    content: [
      { type: "thinking", thinking: "", signature: "sig" },
      { type: "text", text: "Pick the one you like." },
    ],
  },
  { role: "user", content: [context, { type: "text", text: "Any gift ideas?" }] },
  { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "research_gifts", input: { recipient: "Anna", occasion: "Birthday" } }] },
  {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "t2", content: JSON.stringify({ ideas: [idea], note: "Shown as cards." }) }],
  },
  { role: "assistant", content: [{ type: "text", text: "Here are a few ideas." }] },
]

describe("toDisplayMessages", () => {
  it("shows sender and assistant messages with template and gift cards", () => {
    expect(toDisplayMessages(chat)).toEqual([
      { role: "user", text: "Hi, a birthday letter for my sister Anna" },
      { role: "assistant", text: "Lovely.\n\nPick the one you like.", templates: ["classic-envelope", "postcard"] },
      { role: "user", text: "Any gift ideas?" },
      { role: "assistant", text: "Here are a few ideas.", gifts: [idea] },
    ])
  })

  it("hides the app's context block, tool results and thinking", () => {
    const shown = JSON.stringify(toDisplayMessages(chat))
    expect(shown).not.toContain("<context>")
    expect(shown).not.toContain("The cards are showing")
    expect(shown).not.toContain("sig")
  })

  it("joins text blocks that sit next to each other without a break", () => {
    const messages = toDisplayMessages([
      { role: "user", content: "Hello" },
      { role: "assistant", content: [{ type: "text", text: "One, " }, { type: "text", text: "two." }] },
    ])
    expect(messages[1]).toEqual({ role: "assistant", text: "One, two." })
  })

  it("accepts plain string content", () => {
    expect(toDisplayMessages([{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello." }])).toEqual([
      { role: "user", text: "Hi" },
      { role: "assistant", text: "Hello." },
    ])
  })

  it("shows no gift cards for a plan limit or a failed search", () => {
    const messages = toDisplayMessages([
      { role: "user", content: "Ideas please" },
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "research_gifts", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: "Not done: gift research comes with Full moon." }] },
      { role: "assistant", content: [{ type: "tool_use", id: "b", name: "research_gifts", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "b", is_error: true, content: JSON.stringify({ ideas: [idea] }) }] },
      { role: "assistant", content: [{ type: "text", text: "That needs Full moon." }] },
    ])
    expect(messages).toEqual([
      { role: "user", text: "Ideas please" },
      { role: "assistant", text: "That needs Full moon." },
    ])
  })

  it("reads gift results given as content blocks", () => {
    const messages = toDisplayMessages([
      { role: "user", content: "Ideas" },
      { role: "assistant", content: [{ type: "tool_use", id: "a", name: "research_gifts", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "a", content: [{ type: "text", text: JSON.stringify({ ideas: [idea] }) }] }] },
    ])
    expect(messages[1]).toEqual({ role: "assistant", text: "", gifts: [idea] })
  })

  it("skips system messages, empty replies and anything malformed", () => {
    expect(
      toDisplayMessages([
        null,
        "text",
        { role: "user", content: "Hi" },
        { role: "system", content: "Be brief." },
        { role: "assistant", content: [{ type: "thinking", thinking: "", signature: "s" }] },
        { role: "assistant", content: 42 },
        { content: "no role" },
      ]),
    ).toEqual([{ role: "user", text: "Hi" }])
  })

  it("returns nothing for an empty conversation", () => {
    expect(toDisplayMessages([])).toEqual([])
  })
})
