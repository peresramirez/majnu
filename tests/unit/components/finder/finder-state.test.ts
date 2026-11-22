import { describe, expect, it } from "vitest"
import {
  CUT_OFF,
  DEFAULT_ERROR,
  EMPTY_DETAILS,
  NAME_REQUIRED,
  WRAP_ERROR,
  WRAP_LIMITS,
  WRAP_TEMPLATES,
  finderAnnouncement,
  finderReducer,
  initialFinderState,
  latestOptionsIndex,
  noticeRole,
  statusLit,
  wrapAccount,
  wrapChoice,
  wrapExchange,
  wrapReducer,
  wrapRequest,
  type FinderAction,
  type FinderItem,
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
  const chosen = wrapReducer(closed, { type: "choose", option: option("a"), from: 4 })
  const step2 = wrapReducer(chosen, { type: "next" })
  const named = wrapReducer(step2, { type: "details", details: { recipientName: "Ana" } })
  const wrap = (...actions: Parameters<typeof wrapReducer>[1][]) => actions.reduce(wrapReducer, chosen)

  it("starts on step 1, the design, with the first gift template and nothing typed", () => {
    expect(chosen).toEqual({ stage: "choose", step: "design", option: option("a"), templateId: WRAP_TEMPLATES[0], details: EMPTY_DETAILS, from: 4 })
  })

  it("prefills their name when the visitor told Majnu one (issue #71)", () => {
    const prefilled = wrapReducer(closed, { type: "choose", option: option("a"), recipientName: "  Ana " })
    expect(prefilled).toMatchObject({ step: "design", details: { ...EMPTY_DETAILS, recipientName: "Ana" }, from: 0 })
  })

  it("offers the gift templates first, the 3D gift box and the party box among them, then the letters", () => {
    expect(WRAP_TEMPLATES).toEqual(["gift-reveal", "gift-box-3d", "gift-3d", "treasure-map", "party-box", "classic-envelope", "postcard"])
    expect(wrapReducer(chosen, { type: "template", templateId: "gift-box-3d" })).toMatchObject({ stage: "choose", templateId: "gift-box-3d" })
    expect(wrapReducer(chosen, { type: "template", templateId: "party-box" })).toMatchObject({ stage: "choose", templateId: "party-box" })
  })

  it("changes template only while choosing", () => {
    expect(wrapReducer(chosen, { type: "template", templateId: "postcard" })).toMatchObject({ templateId: "postcard" })
    expect(wrapReducer(closed, { type: "template", templateId: "postcard" })).toBe(closed)
  })

  it("goes to the details with Next, and Back returns to the design without losing what was typed", () => {
    expect(step2).toMatchObject({ stage: "choose", step: "details" })
    const typed = wrapReducer(step2, { type: "details", details: { recipientName: "Ana", senderName: "Javi", note: "Für dich", giftCode: "ABC-123" } })
    const back = wrapReducer(typed, { type: "previous" })
    expect(back).toMatchObject({ step: "design", details: { recipientName: "Ana", senderName: "Javi", note: "Für dich", giftCode: "ABC-123" } })
    expect(wrapReducer(back, { type: "template", templateId: "postcard" })).toMatchObject({ step: "design", templateId: "postcard", details: { recipientName: "Ana" } })
    expect(wrapReducer(back, { type: "next" })).toMatchObject({ step: "details", details: { giftCode: "ABC-123" } })
  })

  it("wraps only from step 2: on step 1 the Wrap action moves on to the details", () => {
    expect(wrapReducer(chosen, { type: "submit" })).toMatchObject({ stage: "choose", step: "details" })
  })

  it("needs their name before wrapping, and stops asking once it is typed", () => {
    const refused = wrapReducer(step2, { type: "submit" })
    expect(refused).toMatchObject({ stage: "choose", step: "details", nameMissing: true })
    expect(wrapReducer(wrapReducer(step2, { type: "details", details: { recipientName: "   " } }), { type: "submit" })).toMatchObject({ nameMissing: true })
    expect(wrapReducer(refused, { type: "details", details: { recipientName: "A" } })).toMatchObject({ nameMissing: false })
    expect(NAME_REQUIRED).toMatch(/name/)
  })

  it("keeps every field within the form's limits", () => {
    const long = wrapReducer(step2, { type: "details", details: { recipientName: "x".repeat(100), giftCode: "c".repeat(300) } })
    expect(long.stage === "choose" && long.details.recipientName.length).toBe(WRAP_LIMITS.recipientName)
    expect(long.stage === "choose" && long.details.giftCode.length).toBe(WRAP_LIMITS.giftCode)
  })

  it("goes from wrapping to ready with the letter, keeping the details", () => {
    const wrapping = wrapReducer(named, { type: "submit" })
    expect(wrapping.stage).toBe("wrapping")
    expect(wrapReducer(wrapping, { type: "result", response: { letterId: "L1", slug: "abc" } })).toEqual({
      stage: "ready",
      option: option("a"),
      templateId: "gift-reveal",
      details: { ...EMPTY_DETAILS, recipientName: "Ana" },
      from: 4,
      letterId: "L1",
      slug: "abc",
    })
  })

  it("goes back to step 2 with the error when wrapping fails, keeping the details", () => {
    const wrapping = wrapReducer(named, { type: "submit" })
    expect(wrapReducer(wrapping, { type: "result", response: { error: "Too many", reason: "finder_daily" } })).toMatchObject({
      stage: "choose",
      step: "details",
      error: "Too many",
      reason: "finder_daily",
      details: { recipientName: "Ana" },
    })
    expect(wrapReducer(wrapping, { type: "result", response: { error: "" } })).toMatchObject({ error: WRAP_ERROR })
    expect(wrapReducer(wrapping, { type: "failed", message: "Offline" })).toMatchObject({ stage: "choose", step: "details", error: "Offline" })
  })

  it("ignores a result that arrives when nothing is being wrapped", () => {
    expect(wrapReducer(chosen, { type: "result", response: { letterId: "L1", slug: "abc" } })).toBe(chosen)
  })

  it("closes on back", () => {
    expect(wrapReducer(chosen, { type: "back" })).toEqual(closed)
  })
})

describe("Majnu filling in the wrap form (issue #70)", () => {
  const chosen = wrapReducer({ stage: "closed" }, { type: "choose", option: option("a") })

  it("fills what Majnu heard, shows step 2 and says which fields it filled", () => {
    const filled = wrapReducer(chosen, { type: "fill", fields: { recipientName: " Ana ", senderName: "Javi" } })
    expect(filled).toMatchObject({
      stage: "choose",
      step: "details",
      details: { recipientName: "Ana", senderName: "Javi", note: "", giftCode: "" },
      filled: ["recipientName", "senderName"],
    })
  })

  it("keeps what the visitor typed in fields Majnu did not fill", () => {
    const typed = wrapReducer(wrapReducer(chosen, { type: "next" }), { type: "details", details: { note: "Alles Gute", recipientName: "Anna" } })
    const filled = wrapReducer(typed, { type: "fill", fields: { recipientName: "Ana", giftCode: "GC-42", note: "  " } })
    expect(filled).toMatchObject({ details: { recipientName: "Ana", note: "Alles Gute", giftCode: "GC-42" }, filled: ["recipientName", "giftCode"] })
  })

  it("changes nothing for an empty fill, or when the form is not open", () => {
    expect(wrapReducer(chosen, { type: "fill", fields: {} })).toBe(chosen)
    const wrapping: WrapState = { stage: "wrapping", option: option("a"), templateId: "postcard", details: EMPTY_DETAILS, from: 0 }
    expect(wrapReducer(wrapping, { type: "fill", fields: { recipientName: "Ana" } })).toBe(wrapping)
  })

  it("never wraps by itself", () => {
    const filled = wrapReducer(chosen, { type: "fill", fields: { recipientName: "Ana" } })
    expect(filled.stage).toBe("choose")
  })

  it("closes the wrap step when a new search shows other options", () => {
    expect(wrapReducer(chosen, { type: "options" })).toEqual({ stage: "closed" })
    const ready: WrapState = { stage: "ready", option: option("a"), templateId: "postcard", details: EMPTY_DETAILS, from: 0, letterId: "L", slug: "s" }
    expect(wrapReducer(ready, { type: "options" })).toBe(ready)
  })

  it("leaves the conversation as it is: the form gets the fields", () => {
    const before = run([{ type: "send", text: "für meine Schwester Ana" }])
    expect(run([ev({ type: "fill", fields: { recipientName: "Ana" } })], before)).toBe(before)
  })
})

describe("what a wrap-step message carries (issue #70)", () => {
  const chosen = wrapReducer({ stage: "closed" }, { type: "choose", option: option("a") })

  it("is the chosen option and design while the wrap step is open, and nothing otherwise", () => {
    expect(wrapChoice(chosen)).toEqual({ optionId: "a", templateId: "gift-reveal" })
    expect(wrapChoice(wrapReducer(chosen, { type: "template", templateId: "postcard" }))).toEqual({ optionId: "a", templateId: "postcard" })
    expect(wrapChoice({ stage: "closed" })).toBeUndefined()
    expect(wrapChoice({ stage: "wrapping", option: option("a"), templateId: "postcard", details: EMPTY_DETAILS, from: 0 })).toBeUndefined()
  })

  it("sends the wrap request with the details trimmed and empty ones left out", () => {
    const details = { recipientName: " Ana ", senderName: "", note: "  Für dich ", giftCode: " ABC-123 " }
    expect(wrapRequest("s1", { option: option("a"), templateId: "gift-box-3d", details })).toEqual({
      sessionId: "s1",
      optionId: "a",
      templateId: "gift-box-3d",
      recipientName: "Ana",
      senderName: undefined,
      note: "Für dich",
      giftCode: "ABC-123",
    })
  })

  it("shows on the wrap step what was said since it opened, from the newest message on", () => {
    const items: FinderItem[] = [
      { id: "f0", role: "user", text: "Mama" },
      { id: "f1", role: "options", options: [option("a")], recommendedId: "a", why: "" },
      { id: "f2", role: "user", text: "für Ana" },
      { id: "f3", role: "assistant", text: "Ich habe Ana eingetragen." },
      { id: "f4", role: "user", text: "von Javi" },
      { id: "f5", role: "assistant", text: "Javi steht jetzt drin." },
      { id: "f6", role: "question", text: "Hast du einen Code?", suggestions: ["Noch nicht"] },
    ]
    expect(wrapExchange(items, 2).map((item) => item.id)).toEqual(["f4", "f5", "f6"])
    expect(wrapExchange(items, 7)).toEqual([])
    expect(wrapExchange(items.slice(0, 2), 0).map((item) => item.id)).toEqual(["f0"])
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

describe("what the finder's live region says (issue #62)", () => {
  const ev = (event: FinderEvent): FinderAction => ({ type: "event", event })

  it("reads a limit notice once, here, and gives the notice itself no live role", () => {
    const state = run([{ type: "send", text: "limit" }, ev({ type: "limit", reason: "finder_daily", message: "That was today's last search." }), ev({ type: "done" })])
    const notice = state.items[state.items.length - 1]
    expect(finderAnnouncement(state.items)).toBe("That was today's last search.")
    expect(notice.role === "notice" && noticeRole(notice)).toBeUndefined()
  })

  it("leaves an error to the notice's own alert, so it is heard once", () => {
    const state = run([{ type: "send", text: "error" }, ev({ type: "error", message: "Something went wrong finding gifts. Try again." }), ev({ type: "done" })])
    const notice = state.items[state.items.length - 1]
    expect(finderAnnouncement(state.items)).toBe("")
    expect(notice.role === "notice" && noticeRole(notice)).toBe("alert")
    const failed = run([{ type: "send", text: "x" }, { type: "failed", message: "Check your connection." }])
    expect(finderAnnouncement(failed.items)).toBe("")
  })

  it("says when ideas, a question or a reply arrive", () => {
    expect(finderAnnouncement([])).toBe("")
    const options = run([{ type: "send", text: "Mama" }, ev({ type: "options", options: [option("a"), option("b")], recommendedId: "a", why: "" })])
    expect(finderAnnouncement(options.items)).toBe("2 gift ideas are ready.")
    const asked = run([{ type: "send", text: "Mama" }, ev({ type: "question", text: "What does she love?" })])
    expect(finderAnnouncement(asked.items)).toBe("Majnu asks: What does she love?")
    const replied = run([{ type: "send", text: "Mama" }, ev({ type: "text", delta: "Hello." })])
    expect(finderAnnouncement(replied.items)).toBe("Majnu replied.")
  })
})
