import { describe, expect, it } from "vitest"
import {
  CUT_OFF,
  DEFAULT_ERROR,
  WRAP_ERROR,
  WRAP_TEMPLATES,
  finderReducer,
  initialFinderState,
  latestOptionsIndex,
  statusLit,
  wrapAccount,
  wrapReducer,
  type FinderAction,
  type FinderState,
  type WrapState,
} from "@/components/finder/finder-state"
import type { FinderEvent, GiftOption } from "@/lib/finder/events"

const option = (id: string): GiftOption => ({ id, title: `Gift ${id}`, description: "", reason: "", url: `https://shop.example/${id}` })

function run(actions: FinderAction[], from: FinderState = initialFinderState()): FinderState {
  return actions.reduce(finderReducer, from)
}
const ev = (event: FinderEvent): FinderAction => ({ type: "event", event })

describe("finderReducer", () => {
  it("shows the message, then streams the reply into one paragraph", () => {
    const s = run([{ type: "send", text: "Find a gift for my mother" }, ev({ type: "text", delta: "Here " }), ev({ type: "text", delta: "are three." })])
    expect(s.streaming).toBe(true)
    expect(s.lastMessage).toBe("Find a gift for my mother")
    expect(s.items.map((i) => i.role)).toEqual(["user", "assistant"])
    expect(s.items[1]).toMatchObject({ text: "Here are three." })
  })

  it("keeps the session id and the latest context", () => {
    const s = run([
      { type: "send", text: "x" },
      ev({ type: "session", sessionId: "s1" }),
      ev({ type: "context", context: { language: "de", relationship: "mother" } }),
      ev({ type: "context", context: { language: "de", relationship: "mother", ageRange: [60, 60] } }),
    ])
    expect(s.sessionId).toBe("s1")
    expect(s.context).toEqual({ language: "de", relationship: "mother", ageRange: [60, 60] })
  })

  it("counts status steps and clears the status when done", () => {
    const s = run([{ type: "send", text: "x" }, ev({ type: "status", label: "Looking…" }), ev({ type: "status", label: "Comparing…" })])
    expect(s.status).toBe("Comparing…")
    expect(s.steps).toBe(2)
    const done = finderReducer(s, ev({ type: "done" }))
    expect(done.status).toBeNull()
    expect(done.streaming).toBe(false)
    // A new message starts the moon again.
    expect(finderReducer(done, { type: "send", text: "y" }).steps).toBe(0)
  })

  it("puts text that follows the options in a new paragraph below them", () => {
    const s = run([
      { type: "send", text: "x" },
      ev({ type: "text", delta: "Before" }),
      ev({ type: "options", options: [option("a")], recommendedId: "a", why: "Why" }),
      ev({ type: "text", delta: "  After" }),
    ])
    expect(s.items.map((i) => i.role)).toEqual(["user", "assistant", "options", "assistant"])
    expect(s.items[3]).toMatchObject({ text: "After" })
  })

  it("adds questions with their suggestions", () => {
    const s = run([{ type: "send", text: "x" }, ev({ type: "question", text: "How old?" }), ev({ type: "question", text: "Name?", suggestions: ["Anna"] })])
    expect(s.items.slice(1)).toMatchObject([
      { role: "question", text: "How old?", suggestions: [] },
      { role: "question", text: "Name?", suggestions: ["Anna"] },
    ])
  })

  it("shows a limit with its reason", () => {
    const s = run([{ type: "send", text: "x" }, ev({ type: "limit", reason: "finder_daily", message: "Tomorrow" }), ev({ type: "done" })])
    expect(s.items[1]).toMatchObject({ role: "notice", tone: "limit", reason: "finder_daily", message: "Tomorrow" })
    expect(s.streaming).toBe(false)
  })

  it("offers to send the message again after an error, with a default text", () => {
    const s = run([{ type: "send", text: "Find a gift" }, ev({ type: "error", message: "" })])
    expect(s.items[1]).toMatchObject({ role: "notice", tone: "error", message: DEFAULT_ERROR, retry: "Find a gift" })
  })

  it("turns a failed request into an error notice and stops streaming", () => {
    const s = run([{ type: "send", text: "Find a gift" }, { type: "failed", message: "Offline" }])
    expect(s.streaming).toBe(false)
    expect(s.items[1]).toMatchObject({ role: "notice", tone: "error", message: "Offline", retry: "Find a gift" })
  })

  it("offers sign-in instead of a retry when sign-in is what is missing", () => {
    const s = run([{ type: "send", text: "Find a gift" }, { type: "failed", message: "Sign in", reason: "signin_required" }])
    expect(s.items[1]).toMatchObject({ reason: "signin_required", retry: undefined })
  })

  it("says so when the stream ends without done", () => {
    const s = run([{ type: "send", text: "x" }, ev({ type: "text", delta: "Let me" }), { type: "closed" }])
    expect(s.streaming).toBe(false)
    expect(s.items[2]).toMatchObject({ role: "notice", message: CUT_OFF, retry: "x" })
  })

  it("adds nothing when the stream closes after done, or after a notice", () => {
    const done = run([{ type: "send", text: "x" }, ev({ type: "done" }), { type: "closed" }])
    expect(done.items).toHaveLength(1)
    const limited = run([{ type: "send", text: "x" }, ev({ type: "limit", reason: "site_busy", message: "Busy" }), { type: "closed" }])
    expect(limited.items).toHaveLength(2)
  })

  it("starts over on reset", () => {
    const s = run([{ type: "send", text: "x" }, ev({ type: "session", sessionId: "s1" }), { type: "reset" }])
    expect(s).toEqual(initialFinderState())
  })

  it("gives every item a unique id", () => {
    const s = run([{ type: "send", text: "a" }, ev({ type: "text", delta: "b" }), ev({ type: "options", options: [option("a")], recommendedId: "a", why: "" }), { type: "send", text: "c" }])
    expect(new Set(s.items.map((i) => i.id)).size).toBe(s.items.length)
  })
})

describe("latestOptionsIndex and statusLit", () => {
  it("finds the newest options", () => {
    const s = run([
      { type: "send", text: "a" },
      ev({ type: "options", options: [option("a")], recommendedId: "a", why: "" }),
      { type: "send", text: "b" },
      ev({ type: "options", options: [option("b")], recommendedId: "b", why: "" }),
      ev({ type: "text", delta: "More" }),
    ])
    expect(latestOptionsIndex(s.items)).toBe(3)
    expect(latestOptionsIndex([])).toBe(-1)
  })

  it("fills the moon with each step and makes it full when the ideas are in", () => {
    const start = run([{ type: "send", text: "a" }])
    const one = finderReducer(start, ev({ type: "status", label: "1" }))
    expect(statusLit(one)).toBeGreaterThan(statusLit(start))
    const many = run(Array.from({ length: 10 }, () => ev({ type: "status", label: "s" })), start)
    expect(statusLit(many)).toBeLessThan(1)
    const done = run([ev({ type: "options", options: [option("a")], recommendedId: "a", why: "" }), ev({ type: "done" })], start)
    expect(statusLit(done)).toBe(1)
  })
})

describe("wrapReducer", () => {
  const closed: WrapState = { stage: "closed" }
  const chosen = wrapReducer(closed, { type: "choose", option: option("a") })

  it("starts on the first gift template", () => {
    expect(chosen).toEqual({ stage: "choose", option: option("a"), templateId: WRAP_TEMPLATES[0] })
  })

  it("offers the gift templates first, the 3D gift box and the party box among them, then the letters", () => {
    expect(WRAP_TEMPLATES).toEqual(["gift-reveal", "gift-box-3d", "party-box", "classic-envelope", "postcard"])
    expect(wrapReducer(chosen, { type: "template", templateId: "gift-box-3d" })).toMatchObject({ stage: "choose", templateId: "gift-box-3d" })
    expect(wrapReducer(chosen, { type: "template", templateId: "party-box" })).toMatchObject({ stage: "choose", templateId: "party-box" })
  })

  it("changes template only while choosing", () => {
    expect(wrapReducer(chosen, { type: "template", templateId: "postcard" })).toMatchObject({ templateId: "postcard" })
    expect(wrapReducer(closed, { type: "template", templateId: "postcard" })).toBe(closed)
  })

  it("goes from wrapping to ready with the letter", () => {
    const wrapping = wrapReducer(chosen, { type: "submit" })
    expect(wrapping.stage).toBe("wrapping")
    expect(wrapReducer(wrapping, { type: "result", response: { letterId: "L1", slug: "abc" } })).toEqual({
      stage: "ready",
      option: option("a"),
      templateId: "gift-reveal",
      letterId: "L1",
      slug: "abc",
    })
  })

  it("goes back to choosing with the error when wrapping fails", () => {
    const wrapping = wrapReducer(chosen, { type: "submit" })
    expect(wrapReducer(wrapping, { type: "result", response: { error: "Too many", reason: "finder_daily" } })).toMatchObject({
      stage: "choose",
      error: "Too many",
      reason: "finder_daily",
    })
    expect(wrapReducer(wrapping, { type: "result", response: { error: "" } })).toMatchObject({ error: WRAP_ERROR })
    expect(wrapReducer(wrapping, { type: "failed", message: "Offline" })).toMatchObject({ stage: "choose", error: "Offline" })
  })

  it("ignores a result that arrives when nothing is being wrapped", () => {
    expect(wrapReducer(chosen, { type: "result", response: { letterId: "L1", slug: "abc" } })).toBe(chosen)
  })

  it("closes on back", () => {
    expect(wrapReducer(chosen, { type: "back" })).toEqual(closed)
  })
})

describe("wrapAccount", () => {
  it("tells a guest (anonymous account, or no session yet) from a member", () => {
    expect(wrapAccount({ is_anonymous: true })).toBe("guest")
    expect(wrapAccount(null)).toBe("guest")
    expect(wrapAccount(undefined)).toBe("guest")
    expect(wrapAccount({ is_anonymous: false })).toBe("member")
    expect(wrapAccount({})).toBe("member")
  })
})
