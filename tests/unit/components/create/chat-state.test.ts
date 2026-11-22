import { describe, expect, it } from "vitest"
import {
  CUT_OFF,
  DEFAULT_ERROR,
  chatFrame,
  canSendMessage,
  chatReducer,
  composeMessage,
  sendsOnEnter,
  withVoiceText,
  initialChatState,
  templateMessage,
  type ChatAction,
  type ChatState,
} from "@/components/create/chat-state"
import type { ChatEvent } from "@/lib/agents/events"

const run = (state: ChatState, ...actions: ChatAction[]) => actions.reduce(chatReducer, state)
const ev = (event: ChatEvent): ChatAction => ({ type: "event", event })

describe("composeMessage", () => {
  it("sends the template sentence before what was typed", () => {
    expect(composeMessage("Classic envelope", "  For my sister  ")).toBe('Use the "Classic envelope" template. For my sister')
  })

  it("sends just the template sentence when nothing was typed", () => {
    expect(composeMessage("Postcard", "   ")).toBe(templateMessage("Postcard"))
    expect(templateMessage("Postcard")).toBe('Use the "Postcard" template.')
  })

  it("sends the typed text alone without a template", () => {
    expect(composeMessage(null, " Hello ")).toBe("Hello")
  })
})

describe("the template chip on every send path (issue #70)", () => {
  // The Create tab keeps the chip (template) next to what was typed (draft);
  // every path sends composeMessage(template, text).
  const template = "Classic envelope"
  const sent = 'Use the "Classic envelope" template.'

  it("goes with a message sent with Enter, and Enter only", () => {
    expect(sendsOnEnter({ key: "Enter", shiftKey: false, isComposing: false })).toBe(true)
    expect(sendsOnEnter({ key: "Enter", shiftKey: true, isComposing: false })).toBe(false)
    expect(sendsOnEnter({ key: "Enter", shiftKey: false, isComposing: true })).toBe(false)
    expect(sendsOnEnter({ key: "a", shiftKey: false, isComposing: false })).toBe(false)
    expect(composeMessage(template, "For my sister")).toBe(`${sent} For my sister`)
  })

  it("goes with the send button, even with nothing typed", () => {
    expect(canSendMessage(false, "", template)).toBe(true)
    expect(canSendMessage(false, "  ", null)).toBe(false)
    expect(canSendMessage(true, "For my sister", template)).toBe(false)
    expect(composeMessage(template, "")).toBe(sent)
  })

  it("goes with a message dictated by voice, added to what was typed", () => {
    expect(withVoiceText("", "a birthday letter")).toBe("a birthday letter")
    expect(withVoiceText("For my sister  ", "she turns 30")).toBe("For my sister she turns 30")
    expect(composeMessage(template, withVoiceText("For my sister", "she turns 30"))).toBe(`${sent} For my sister she turns 30`)
  })

  it("goes with a starter tapped in an empty chat, which used to drop it", () => {
    expect(composeMessage(template, "A birthday letter for my sister")).toBe(`${sent} A birthday letter for my sister`)
    expect(composeMessage(null, "A birthday letter for my sister")).toBe("A birthday letter for my sister")
  })
})

describe("chatReducer", () => {
  it("streams text into one assistant message and ends on done", () => {
    const state = run(
      initialChatState(),
      { type: "send", text: "A letter for Anna" },
      ev({ type: "letter", letterId: "l1" }),
      ev({ type: "text", delta: "Lovely. " }),
      ev({ type: "text", delta: "What is the occasion?" }),
      ev({ type: "done" }),
    )
    expect(state.letterId).toBe("l1")
    expect(state.streaming).toBe(false)
    expect(state.items.map((i) => [i.role, "text" in i ? i.text : ""])).toEqual([
      ["user", "A letter for Anna"],
      ["assistant", "Lovely. What is the occasion?"],
    ])
  })

  it("shows the tool label while it runs and starts a new paragraph after it", () => {
    let state = run(
      initialChatState(),
      { type: "send", text: "Find a gift" },
      ev({ type: "text", delta: "Let me look." }),
      ev({ type: "tool", name: "research_gifts", status: "start", label: "Looking for gift ideas…" }),
    )
    expect(state.status).toBe("Looking for gift ideas…")
    state = run(state, ev({ type: "tool", name: "research_gifts", status: "done", label: "Found 3 ideas" }), ev({ type: "text", delta: "Here they are." }))
    expect(state.status).toBeNull()
    expect(state.items[1]).toMatchObject({ role: "assistant", text: "Let me look.\n\nHere they are." })
  })

  it("attaches template and gift cards to the reply, and puts later text below them", () => {
    const state = run(
      initialChatState(),
      { type: "send", text: "Ideas?" },
      ev({ type: "text", delta: "Three designs:" }),
      ev({ type: "templates", ids: ["classic-envelope", "postcard"] }),
      ev({ type: "text", delta: "Which one?" }),
      ev({ type: "gifts", ideas: [{ title: "Spa day", reason: "Relaxing" }] }),
      ev({ type: "done" }),
    )
    expect(state.items).toMatchObject([
      { role: "user" },
      { role: "assistant", text: "Three designs:", templates: ["classic-envelope", "postcard"] },
      { role: "assistant", text: "Which one?", gifts: [{ title: "Spa day", reason: "Relaxing" }] },
    ])
  })

  it("creates an assistant item for cards that arrive before any text", () => {
    const state = run(initialChatState(), { type: "send", text: "Show me" }, ev({ type: "templates", ids: ["postcard"] }))
    expect(state.items[1]).toMatchObject({ role: "assistant", text: "", templates: ["postcard"] })
  })

  it("counts previews so the iframe reloads, and records the template", () => {
    const state = run(
      initialChatState({ letterId: "l1" }),
      { type: "send", text: "Build it" },
      ev({ type: "preview", letterId: "l1", kind: "letter", templateId: "gift-reveal" }),
      ev({ type: "preview", letterId: "l1", kind: "letter", templateId: "gift-reveal" }),
    )
    expect(state).toMatchObject({ previewVersion: 2, hasContent: true, kind: "letter", templateId: "gift-reveal" })
  })

  it("adds notices for limits, refusals and errors", () => {
    const state = run(
      initialChatState(),
      { type: "send", text: "Calendar please" },
      ev({ type: "limit", reason: "full_moon_only", message: "Advent calendars are part of Full moon." }),
      ev({ type: "refusal", message: "" }),
      ev({ type: "error", message: "" }),
    )
    expect(state.items.slice(1)).toMatchObject([
      { role: "notice", tone: "limit", reason: "full_moon_only", message: "Advent calendars are part of Full moon." },
      { role: "notice", tone: "refusal" },
      { role: "notice", tone: "error", message: DEFAULT_ERROR },
    ])
  })

  it("says the reply was cut off when the stream ends without done", () => {
    const cut = run(initialChatState(), { type: "send", text: "Hi" }, ev({ type: "text", delta: "Hel" }), { type: "closed" })
    expect(cut.streaming).toBe(false)
    expect(cut.items.at(-1)).toMatchObject({ role: "notice", tone: "error", message: CUT_OFF })

    const finished = run(initialChatState(), { type: "send", text: "Hi" }, ev({ type: "done" }), { type: "closed" })
    expect(finished.items).toHaveLength(1)
  })

  it("starts a new assistant message for the next reply", () => {
    const state = run(
      initialChatState({
        letterId: "l1",
        hasContent: true,
        messages: [
          { role: "user", text: "Hi" },
          { role: "assistant", text: "Hello" },
        ],
      }),
      { type: "send", text: "Change the headline" },
      ev({ type: "text", delta: "Done." }),
    )
    expect(state.items.map((i) => i.role)).toEqual(["user", "assistant", "user", "assistant"])
    expect(new Set(state.items.map((i) => i.id)).size).toBe(4)
  })

  it("records a failed request as an error notice", () => {
    const state = run(initialChatState(), { type: "send", text: "Hi" }, { type: "failed", message: "You're offline." })
    expect(state.streaming).toBe(false)
    expect(state.items.at(-1)).toMatchObject({ role: "notice", tone: "error", message: "You're offline." })
  })
})

describe("chatFrame (issue #62)", () => {
  it("starts a new gift with the starter and no header", () => {
    expect(chatFrame({ letterId: null, hasContent: false, itemCount: 0 })).toEqual({ header: false, opening: "new", phoneView: "chat" })
  })

  it("shows no header after a refused first message, because no gift was made", () => {
    // The sender's message and the day's-limit notice, and still no letter id.
    expect(chatFrame({ letterId: null, hasContent: false, itemCount: 2 })).toEqual({ header: false, opening: null, phoneView: "chat" })
  })

  it("opens a built gift with no conversation on its preview, with a chat that starts from it", () => {
    expect(chatFrame({ letterId: "l1", hasContent: true, itemCount: 0, storedMessages: 0 })).toEqual({ header: true, opening: "built", phoneView: "preview" })
  })

  it("opens a gift with a conversation on the chat", () => {
    expect(chatFrame({ letterId: "l1", hasContent: true, itemCount: 4, storedMessages: 4 })).toEqual({ header: true, opening: null, phoneView: "chat" })
  })

  it("keeps the starter for a gift that exists but was never built", () => {
    expect(chatFrame({ letterId: "l1", hasContent: false, itemCount: 0 })).toEqual({ header: true, opening: "new", phoneView: "chat" })
  })
})
