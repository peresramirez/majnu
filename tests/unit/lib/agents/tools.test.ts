import type { BetaToolUseBlock } from "@anthropic-ai/sdk/resources/beta"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/limits", () => ({ canUseFeature: vi.fn() }))
vi.mock("@/lib/letters/store", () => ({ saveLetterContent: vi.fn() }))
vi.mock("@/lib/agents/client", () => ({
  getClient: () => {
    throw new Error("no network in unit tests")
  },
  getModel: () => "test-model",
  agentRequestBase: () => ({}),
  AGENT_EFFORT: "low",
}))
vi.mock("@/lib/agents/builder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/builder")>()),
  buildContent: vi.fn(),
}))
vi.mock("@/lib/agents/research", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/research")>()),
  researchGifts: vi.fn(),
}))

import { buildContent } from "@/lib/agents/builder"
import type { ChatEvent } from "@/lib/agents/events"
import { researchGifts } from "@/lib/agents/research"
import { MAIN_TOOLS, MAX_BUILDS_PER_TURN, checkBuild, keepGiftList, runTool, type TurnState } from "@/lib/agents/tools"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { saveLetterContent } from "@/lib/letters/store"
import { canUseFeature, type LimitResult } from "@/lib/limits"

const allowed: LimitResult = { ok: true }
const fullMoonOnly: LimitResult = { ok: false, reason: "full_moon_only", message: "Advent calendars come with Full moon." }
const monthUsedUp: LimitResult = { ok: false, reason: "monthly_gifts", message: "You have made 3 gifts this month." }

let events: ChatEvent[]

function makeState(letter: Partial<TurnState["letter"]> = {}): TurnState {
  return {
    letterId: "letter-1",
    shareUrl: "https://majnu.app/l/abc123defg",
    now: new Date("2026-11-21T12:00:00Z"),
    timezone: "Europe/Berlin",
    emit: (event) => events.push(event),
    letter: { kind: null, templateId: null, content: null, ...letter },
  }
}

function call(name: string, input: unknown): BetaToolUseBlock {
  return { type: "tool_use", id: `call-${name}`, name, input } as BetaToolUseBlock
}

function limits(byFeature: Partial<Record<"calendar" | "research" | "new_gift", LimitResult>>) {
  vi.mocked(canUseFeature).mockImplementation(async (feature) => byFeature[feature] ?? allowed)
}

const brief = "For Anna from Javier, birthday, English, warm."

beforeEach(() => {
  events = []
  vi.mocked(canUseFeature).mockReset()
  vi.mocked(saveLetterContent).mockReset()
  vi.mocked(buildContent).mockReset()
  vi.mocked(researchGifts).mockReset()
  limits({})
})

describe("tool definitions", () => {
  it("are the five main-agent tools, in a fixed order, with object schemas", () => {
    expect(MAIN_TOOLS.map((t) => t.name)).toEqual(["suggest_templates", "research_gifts", "build_letter", "edit_letter", "update_gift_list"])
    for (const tool of MAIN_TOOLS) {
      expect(tool.input_schema.type).toBe("object")
      expect(tool.input_schema).not.toHaveProperty("$schema")
    }
  })
})

describe("checkBuild", () => {
  it("asks for the calendar feature for calendars and new_gift for an empty letter", async () => {
    await checkBuild("calendar", false)
    expect(vi.mocked(canUseFeature).mock.calls.map((c) => c[0])).toEqual(["calendar", "new_gift"])
  })

  it("checks nothing for rebuilding a letter that already has content", async () => {
    expect(await checkBuild("letter", true)).toEqual({ ok: true })
    expect(canUseFeature).not.toHaveBeenCalled()
  })
})

describe("build_letter", () => {
  it("holds a party pop box given as a present to its gift (issue #59)", async () => {
    vi.mocked(buildContent).mockResolvedValue({ kind: "letter", content: letterFixtures["party-box"] })
    await runTool(call("build_letter", { templateId: "party-box", brief, givenAsGift: true }), makeState())
    expect(buildContent).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "build", templateId: "party-box", giftRequired: true }))

    await runTool(call("build_letter", { templateId: "party-box", brief }), makeState())
    expect(buildContent).toHaveBeenLastCalledWith(expect.objectContaining({ templateId: "party-box", giftRequired: false }))
  })

  it("offers givenAsGift as an optional field", () => {
    const tool = MAIN_TOOLS.find((t) => t.name === "build_letter")!
    const schema = tool.input_schema as { properties: Record<string, { type?: string }>; required?: string[] }
    expect(schema.properties.givenAsGift?.type).toBe("boolean")
    expect(schema.required).not.toContain("givenAsGift")
  })

  it("refuses a calendar without Full moon: emits a limit, tells the model, builds nothing", async () => {
    limits({ calendar: fullMoonOnly })
    const result = await runTool(call("build_letter", { templateId: "advent-classic", brief }), makeState())

    expect(events).toContainEqual({ type: "limit", reason: "full_moon_only", message: "Advent calendars come with Full moon." })
    expect(result.is_error).toBeUndefined()
    expect(String(result.content)).toContain("Not done")
    expect(buildContent).not.toHaveBeenCalled()
    expect(saveLetterContent).not.toHaveBeenCalled()
  })

  it("counts the first build of an empty letter against the month's gifts", async () => {
    limits({ new_gift: monthUsedUp })
    await runTool(call("build_letter", { templateId: "classic-envelope", brief }), makeState())

    expect(canUseFeature).toHaveBeenCalledWith("new_gift")
    expect(events).toContainEqual({ type: "limit", reason: "monthly_gifts", message: "You have made 3 gifts this month." })
    expect(buildContent).not.toHaveBeenCalled()
  })

  it("does not count a rebuild of a letter that already has content", async () => {
    limits({ new_gift: monthUsedUp })
    vi.mocked(buildContent).mockResolvedValue({ kind: "letter", content: letterFixtures.postcard })
    const state = makeState({ kind: "letter", templateId: "classic-envelope", content: letterFixtures["classic-envelope"] })
    await runTool(call("build_letter", { templateId: "postcard", brief }), state)

    expect(canUseFeature).not.toHaveBeenCalled()
    expect(saveLetterContent).toHaveBeenCalled()
  })

  it("builds, saves with a generic title, updates the turn and shows the preview", async () => {
    vi.mocked(buildContent).mockResolvedValue({ kind: "letter", content: letterFixtures["classic-envelope"] })
    const state = makeState()
    const result = await runTool(call("build_letter", { templateId: "classic-envelope", brief }), state)

    expect(saveLetterContent).toHaveBeenCalledWith("letter-1", {
      kind: "letter",
      templateId: "classic-envelope",
      title: "A letter for Anna",
      content: letterFixtures["classic-envelope"],
    })
    expect(state.letter).toEqual({ kind: "letter", templateId: "classic-envelope", content: letterFixtures["classic-envelope"] })
    expect(events).toEqual([
      { type: "preview", letterId: "letter-1", kind: "letter", templateId: "classic-envelope" },
      { type: "tool", name: "build_letter", status: "done", label: "Writing your letter…" },
    ])
    expect(String(result.content)).toContain("https://majnu.app/l/abc123defg")
  })

  it("returns an error result and an error status when the builder fails", async () => {
    vi.mocked(buildContent).mockRejectedValue(new Error("boom"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    const result = await runTool(call("build_letter", { templateId: "classic-envelope", brief }), makeState())

    expect(result.is_error).toBe(true)
    expect(events).toContainEqual({ type: "tool", name: "build_letter", status: "error", label: "Something went wrong writing the letter." })
    expect(saveLetterContent).not.toHaveBeenCalled()
  })

  it("rejects an unknown template without building", async () => {
    const result = await runTool(call("build_letter", { templateId: "birthday-cake", brief }), makeState())
    expect(result.is_error).toBe(true)
    expect(buildContent).not.toHaveBeenCalled()
  })
})

describe("edit_letter", () => {
  it("needs something built first", async () => {
    const result = await runTool(call("edit_letter", { change: "Shorter" }), makeState())
    expect(result.is_error).toBe(true)
    expect(buildContent).not.toHaveBeenCalled()
  })

  it("does not switch between a letter and a calendar", async () => {
    const state = makeState({ kind: "letter", templateId: "classic-envelope", content: letterFixtures["classic-envelope"] })
    const result = await runTool(call("edit_letter", { change: "Make it a calendar", templateId: "countdown" }), state)
    expect(result.is_error).toBe(true)
    expect(buildContent).not.toHaveBeenCalled()
  })

  it("checks the calendar feature when editing a calendar", async () => {
    limits({ calendar: fullMoonOnly })
    const state = makeState({ kind: "calendar", templateId: "countdown", content: calendarFixtures.countdown })
    await runTool(call("edit_letter", { change: "Warmer notes" }), state)

    expect(canUseFeature).toHaveBeenCalledWith("calendar")
    expect(canUseFeature).not.toHaveBeenCalledWith("new_gift")
    expect(events.some((e) => e.type === "limit")).toBe(true)
    expect(buildContent).not.toHaveBeenCalled()
  })

  it("passes the current content and the change to the builder", async () => {
    vi.mocked(buildContent).mockResolvedValue({ kind: "letter", content: letterFixtures["classic-envelope"] })
    const state = makeState({ kind: "letter", templateId: "classic-envelope", content: letterFixtures["classic-envelope"] })
    await runTool(call("edit_letter", { change: "Sign it Javi" }), state)

    expect(buildContent).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "edit", templateId: "classic-envelope", current: letterFixtures["classic-envelope"], change: "Sign it Javi" }),
    )
  })
})

describe("research_gifts", () => {
  const input = { recipient: "My dad, loves cycling", occasion: "Birthday" }

  it("is a Full moon feature", async () => {
    limits({ research: { ok: false, reason: "full_moon_only", message: "Gift research comes with Full moon." } })
    const result = await runTool(call("research_gifts", input), makeState())

    expect(events).toContainEqual({ type: "limit", reason: "full_moon_only", message: "Gift research comes with Full moon." })
    expect(String(result.content)).toContain("Not done")
    expect(researchGifts).not.toHaveBeenCalled()
  })

  it("shows the ideas and returns them as JSON the chat can show again", async () => {
    const ideas = [{ title: "Bike computer", reason: "He rides every weekend.", price: "€49" }]
    vi.mocked(researchGifts).mockResolvedValue(ideas)
    const result = await runTool(call("research_gifts", input), makeState())

    expect(events).toContainEqual({ type: "gifts", ideas })
    expect(JSON.parse(String(result.content)).ideas).toEqual(ideas)
  })
})

describe("suggest_templates", () => {
  it("shows the cards once each", async () => {
    await runTool(call("suggest_templates", { templateIds: ["classic-envelope", "postcard", "classic-envelope"] }), makeState())
    expect(events[0]).toEqual({ type: "templates", ids: ["classic-envelope", "postcard"] })
  })

  it("shows nothing for an unknown template", async () => {
    const result = await runTool(call("suggest_templates", { templateIds: ["nope"] }), makeState())
    expect(result.is_error).toBe(true)
    expect(events.some((e) => e.type === "templates")).toBe(false)
  })
})

describe("update_gift_list", () => {
  const { wishlist: _list, ...partyWithoutList } = letterFixtures["party-invite"]
  void _list
  const builtParty = () => makeState({ kind: "letter", templateId: "party-invite", content: partyWithoutList })

  it("adds the chosen gifts with server-made ids, keeps only https links, saves and shows the preview", async () => {
    const state = builtParty()
    const result = await runTool(
      call("update_gift_list", {
        add: [
          { title: "Polaroid film", price: "€30", url: "https://shop.example/film" },
          { title: "Fairy lights", url: "javascript:alert(1)" },
        ],
      }),
      state,
    )
    const saved = vi.mocked(saveLetterContent).mock.calls[0]
    expect(saved[0]).toBe("letter-1")
    expect(saved[1]).toMatchObject({ kind: "letter", templateId: "party-invite", title: "An invitation for Everyone" })
    const list = (saved[1].content as typeof partyWithoutList & { wishlist: { id: string }[] }).wishlist
    expect(list).toEqual([
      { id: expect.stringMatching(/^[A-Za-z0-9]{10}$/), title: "Polaroid film", price: "€30", url: "https://shop.example/film" },
      { id: expect.stringMatching(/^[A-Za-z0-9]{10}$/), title: "Fairy lights" },
    ])
    expect(state.letter.content).toEqual(saved[1].content)
    expect(events).toContainEqual({ type: "preview", letterId: "letter-1", kind: "letter", templateId: "party-invite" })
    expect(result.is_error).toBeUndefined()
    // The model gets the ids, so it can take a gift off later.
    expect(String(result.content)).toContain(list[0].id)
  })

  it("takes gifts off by id and keeps the other ids, so their claims stay valid", async () => {
    const state = makeState({ kind: "letter", templateId: "party-invite", content: letterFixtures["party-invite"] })
    const result = await runTool(call("update_gift_list", { removeIds: ["fxpty02", "nope"] }), state)
    const content = vi.mocked(saveLetterContent).mock.calls[0][1].content as typeof letterFixtures["party-invite"]
    expect(content.wishlist?.map((item) => item.id)).toEqual(["fxpty01", "fxpty03"])
    expect(String(result.content)).toContain("nope")
  })

  it("refuses letters that are not wedding or party invitations, and invitations not built yet", async () => {
    const envelope = makeState({ kind: "letter", templateId: "classic-envelope", content: letterFixtures["classic-envelope"] })
    expect((await runTool(call("update_gift_list", { add: [{ title: "Vase" }] }), envelope)).is_error).toBe(true)
    expect((await runTool(call("update_gift_list", { add: [{ title: "Vase" }] }), makeState())).is_error).toBe(true)
    expect(saveLetterContent).not.toHaveBeenCalled()
  })

  it("asks for something to change", async () => {
    expect((await runTool(call("update_gift_list", {}), builtParty())).is_error).toBe(true)
    expect(saveLetterContent).not.toHaveBeenCalled()
  })
})

describe("the gift list across builds and edits", () => {
  it("survives edit_letter: the builder never sees it, the tool puts it back", async () => {
    const { wishlist: _list, ...edited } = { ...letterFixtures["party-invite"], headline: "Mia turns 26" }
    void _list
    vi.mocked(buildContent).mockResolvedValue({ kind: "letter", content: edited })
    const state = makeState({ kind: "letter", templateId: "party-invite", content: letterFixtures["party-invite"] })
    await runTool(call("edit_letter", { change: "She turns 26" }), state)

    const saved = vi.mocked(saveLetterContent).mock.calls[0][1].content as typeof letterFixtures["party-invite"]
    expect(saved.headline).toBe("Mia turns 26")
    expect(saved.wishlist).toEqual(letterFixtures["party-invite"].wishlist)
  })

  it("keeps the list when an invitation is rebuilt, and adds none to a letter that had none", () => {
    const built = { kind: "letter" as const, content: letterFixtures["classic-envelope"] }
    expect(keepGiftList(letterFixtures["party-invite"], built)).toEqual({
      kind: "letter",
      content: { ...letterFixtures["classic-envelope"], wishlist: letterFixtures["party-invite"].wishlist },
    })
    expect(keepGiftList(letterFixtures["classic-envelope"], built)).toBe(built)
    expect(keepGiftList(null, built)).toBe(built)
  })
})

// Live drafts (issue #30): the builder's streamed text becomes draft events.
describe("live drafts", () => {
  // A builder that streams `text` into its draft sink, then returns `content`.
  function streamingBuilder(text: string, content: unknown) {
    vi.mocked(buildContent).mockImplementation(async (input) => {
      input.draft?.push(text)
      input.draft?.flush()
      return { kind: "letter", content } as Awaited<ReturnType<typeof buildContent>>
    })
  }

  it("sends drafts while build_letter writes, then the preview of the saved content", async () => {
    const content = letterFixtures["gift-reveal"]
    streamingBuilder(`{"recipientName": "Mara", "headline": "For you", "gifts": [{"title": "Spa", "code": "SECRET-1", "url": "https://x.example"`, content)
    await runTool(call("build_letter", { templateId: "gift-reveal", brief }), makeState())

    expect(events.map((e) => e.type)).toEqual(["draft", "preview", "tool"])
    expect(events[0]).toEqual({
      type: "draft",
      letterId: "letter-1",
      kind: "letter",
      templateId: "gift-reveal",
      content: { recipientName: "Mara", headline: "For you", gifts: [{ title: "Spa" }] },
    })
    expect(JSON.stringify(events[0])).not.toContain("SECRET-1")
  })

  it("shows an edit over the current content, so what is not rewritten yet stays", async () => {
    const current = letterFixtures["classic-envelope"]
    streamingBuilder(`{"recipientName": "${current.recipientName}", "headline": "A new headline`, current)
    const state = makeState({ kind: "letter", templateId: "classic-envelope", content: current })
    await runTool(call("edit_letter", { change: "New headline" }), state)

    const draft = events.find((e) => e.type === "draft")
    expect(draft).toMatchObject({ kind: "letter", templateId: "classic-envelope" })
    expect(draft && "content" in draft ? draft.content : null).toMatchObject({ headline: "A new headline", body: current.body, signOff: current.signOff })
  })

  it("runs the builder at most twice for one message", async () => {
    vi.mocked(buildContent).mockResolvedValue({ kind: "letter", content: letterFixtures["classic-envelope"] })
    const state = makeState()
    await runTool(call("build_letter", { templateId: "classic-envelope", brief }), state)
    await runTool(call("edit_letter", { change: "Warmer" }), state)
    const third = await runTool(call("edit_letter", { change: "Shorter" }), state)

    expect(MAX_BUILDS_PER_TURN).toBe(2)
    expect(buildContent).toHaveBeenCalledTimes(2)
    expect(String(third.content)).toMatch(/^Not done: the page was already changed 2 times/)
    expect(third.is_error).toBeUndefined()
  })
})
