// Covers app/api/chat/route.ts. It lives with the agent tests because that is
// the test folder the agent work owns; by the AGENTS.md convention it would be
// tests/unit/app/api/chat/route.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

let user: { id: string } | null
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}))
vi.mock("@/lib/letters/store", () => ({
  createLetter: vi.fn(),
  getMyLetter: vi.fn(),
  saveChat: vi.fn(),
}))
vi.mock("@/lib/limits", () => ({
  canCreateLetter: vi.fn(),
  canSendChatTurn: vi.fn(),
  canUseFeature: vi.fn(),
}))
vi.mock("@/lib/agents/main", () => ({ runMainAgent: vi.fn() }))

import { POST } from "@/app/api/chat/route"
import type { ChatEvent } from "@/lib/agents/events"
import { runMainAgent, type MainAgentResult } from "@/lib/agents/main"
import { letterFixtures } from "@/lib/letters/fixtures"
import { createLetter, getMyLetter, saveChat, type OwnedLetter } from "@/lib/letters/store"
import { canCreateLetter, canSendChatTurn } from "@/lib/limits"

function post(body: unknown): Request {
  return new Request("http://localhost:3000/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function eventsOf(response: Response): Promise<ChatEvent[]> {
  expect(response.headers.get("content-type")).toContain("application/x-ndjson")
  const text = await response.text()
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ChatEvent)
}

const userTurn = { role: "user" as const, content: [{ type: "text" as const, text: "Hi" }] }
const assistantTurn = { role: "assistant" as const, content: [{ type: "text" as const, text: "Hello." }] }
const replied: MainAgentResult = { appended: [userTurn, assistantTurn], outcome: "done" }

const existing: OwnedLetter = {
  id: "letter-1",
  ownerId: "user-1",
  slug: "abc123defg",
  kind: "letter",
  templateId: "classic-envelope",
  title: "A letter for Anna",
  content: letterFixtures["classic-envelope"],
  createdAt: "2026-11-21T10:00:00Z",
  updatedAt: "2026-11-21T10:00:00Z",
  chat: [{ role: "user", content: "earlier" }, { role: "assistant", content: [{ type: "text", text: "earlier reply" }] }],
}

beforeEach(() => {
  vi.clearAllMocks()
  user = { id: "user-1" }
  vi.mocked(canCreateLetter).mockResolvedValue({ ok: true })
  vi.mocked(canSendChatTurn).mockResolvedValue({ ok: true })
  vi.mocked(createLetter).mockResolvedValue({ id: "new-letter", slug: "newslug123" })
  vi.mocked(getMyLetter).mockResolvedValue(existing)
  vi.mocked(runMainAgent).mockImplementation(async ({ state }) => {
    state.emit({ type: "text", delta: "Hello." })
    return replied
  })
})

describe("POST /api/chat", () => {
  it("needs a session", async () => {
    user = null
    const response = await POST(post({ message: "Hi" }))
    expect(response.status).toBe(401)
    expect(runMainAgent).not.toHaveBeenCalled()
  })

  it("needs a message, and not a huge one", async () => {
    expect((await POST(post({ message: "   " }))).status).toBe(400)
    const tooLong = await POST(post({ message: "x".repeat(4001) }))
    expect(tooLong.status).toBe(400)
    expect(await tooLong.json()).toEqual({ error: "That message is too long. Try a shorter one." })
  })

  it("creates a letter for a first message and sends its id before anything else", async () => {
    const events = await eventsOf(await POST(post({ message: "Hi", timezone: "Europe/Berlin" })))

    expect(events).toEqual([{ type: "letter", letterId: "new-letter" }, { type: "text", delta: "Hello." }, { type: "done" }])
    expect(canCreateLetter).toHaveBeenCalled()
    expect(canSendChatTurn).toHaveBeenCalledWith("new-letter")
    expect(vi.mocked(runMainAgent).mock.calls[0]![0].state.shareUrl).toMatch(/\/l\/newslug123$/)
    expect(saveChat).toHaveBeenCalledWith("new-letter", [userTurn, assistantTurn])
  })

  it("stops at the daily letter limit without creating a letter or calling the model", async () => {
    vi.mocked(canCreateLetter).mockResolvedValue({ ok: false, reason: "daily_letters", message: "That's 5 gifts today." })
    const events = await eventsOf(await POST(post({ message: "Hi" })))

    expect(events).toEqual([{ type: "limit", reason: "daily_letters", message: "That's 5 gifts today." }, { type: "done" }])
    expect(createLetter).not.toHaveBeenCalled()
    expect(runMainAgent).not.toHaveBeenCalled()
  })

  it("stops at the chat turn limit before calling the model", async () => {
    vi.mocked(canSendChatTurn).mockResolvedValue({ ok: false, reason: "chat_turns", message: "This chat is full." })
    const events = await eventsOf(await POST(post({ letterId: "letter-1", message: "Hi" })))

    expect(events).toEqual([{ type: "limit", reason: "chat_turns", message: "This chat is full." }, { type: "done" }])
    expect(runMainAgent).not.toHaveBeenCalled()
    expect(saveChat).not.toHaveBeenCalled()
  })

  it("answers 404 for a letter that is not the sender's", async () => {
    vi.mocked(getMyLetter).mockResolvedValue(null)
    const response = await POST(post({ letterId: "someone-elses", message: "Hi" }))
    expect(response.status).toBe(404)
    expect(runMainAgent).not.toHaveBeenCalled()
  })

  it("replays the stored chat and saves it append-only", async () => {
    const events = await eventsOf(await POST(post({ letterId: "letter-1", message: "Hi" })))

    expect(events.at(-1)).toEqual({ type: "done" })
    expect(events.some((e) => e.type === "letter")).toBe(false)
    const args = vi.mocked(runMainAgent).mock.calls[0]![0]
    expect(args.history).toBe(existing.chat)
    expect(args.state.letter).toEqual({ kind: "letter", templateId: "classic-envelope", content: letterFixtures["classic-envelope"] })
    expect(saveChat).toHaveBeenCalledWith("letter-1", [...existing.chat, userTurn, assistantTurn])
  })

  it("saves nothing when the model never replied, so the sender can simply resend", async () => {
    vi.mocked(runMainAgent).mockImplementation(async ({ state }) => {
      state.emit({ type: "refusal", message: "No." })
      return { appended: [userTurn], outcome: "refusal" }
    })
    const events = await eventsOf(await POST(post({ letterId: "letter-1", message: "Hi" })))

    expect(events).toEqual([{ type: "refusal", message: "No." }, { type: "done" }])
    expect(saveChat).not.toHaveBeenCalled()
  })

  it("still ends with done when saving fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(saveChat).mockRejectedValue(new Error("db down"))
    const events = await eventsOf(await POST(post({ letterId: "letter-1", message: "Hi" })))

    expect(events.slice(-2)).toEqual([
      { type: "error", message: "Something went wrong saving this conversation. Try again." },
      { type: "done" },
    ])
  })
})
