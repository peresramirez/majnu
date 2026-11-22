import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/client", () => ({ getClient: vi.fn(), agentRequestBase: () => ({}), AGENT_EFFORT: "low" }))

import Anthropic from "@anthropic-ai/sdk"
import {
  BUILDER_SYSTEM_PROMPT,
  BuilderInvalidOutput,
  BuilderLetterContent,
  BuilderRefusal,
  EVENT_TEMPLATES,
  GIFT_TEMPLATES,
  buildContent,
  checkContent,
  contentForBuilder,
  sanitize,
  titleFor,
} from "@/lib/agents/builder"
import { getClient } from "@/lib/agents/client"
import { createDraftStream, toLetterDraft, type DraftSink } from "@/lib/agents/draft"
import type { LetterDraft } from "@/lib/agents/events"
import { fakeClient, type Scripted } from "./fake-stream"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import type { LetterContent } from "@/lib/letters/schema"

function withoutEvent(content: LetterContent): LetterContent {
  const { event, ...rest } = content
  void event
  return rest
}

describe("checkContent", () => {
  it("accepts every fixture for its own template", () => {
    for (const [id, content] of Object.entries(letterFixtures)) {
      expect(checkContent(id as keyof typeof letterFixtures, { kind: "letter", content })).toEqual([])
    }
    for (const [id, content] of Object.entries(calendarFixtures)) {
      expect(checkContent(id as keyof typeof calendarFixtures, { kind: "calendar", content })).toEqual([])
    }
  })

  it("needs exactly 24 doors in an advent calendar", () => {
    const content = { ...calendarFixtures["advent-classic"], doors: calendarFixtures["advent-classic"].doors.slice(0, 23) }
    expect(checkContent("advent-classic", { kind: "calendar", content })).toEqual(["the advent calendar needs exactly 24 doors, not 23"])
  })

  it("needs 1 to 31 doors in a countdown and a real start date", () => {
    const content = { ...calendarFixtures.countdown, doors: [], startDate: "2026-02-30" }
    expect(checkContent("countdown", { kind: "calendar", content })).toHaveLength(2)
  })

  it("needs an event on invitations and a gift on a gift reveal", () => {
    const { event, ...noEvent } = letterFixtures["party-invite"]
    void event
    expect(checkContent("party-invite", { kind: "letter", content: noEvent })).toHaveLength(1)
    expect(checkContent("gift-reveal", { kind: "letter", content: { ...letterFixtures["gift-reveal"], gifts: [] } })).toHaveLength(1)
  })

  it("needs a gift in a 3D gift box", () => {
    const content = { ...letterFixtures["gift-box-3d"], gifts: [] }
    expect(checkContent("gift-box-3d", { kind: "letter", content })).toEqual(["a 3D gift box needs at least one gift"])
    // Given as a gift or not, the box opens on its gift card.
    expect(checkContent("gift-box-3d", { kind: "letter", content }, { giftRequired: true })).toEqual(["a 3D gift box needs at least one gift"])
  })

  it("needs a gift in a party box only when it is given as a gift", () => {
    const content = { ...letterFixtures["party-box"], gifts: [] }
    expect(checkContent("party-box", { kind: "letter", content })).toEqual([])
    expect(checkContent("party-box", { kind: "letter", content }, { giftRequired: true })).toEqual([
      "this page is given as a gift, so it needs the gift from the brief",
    ])
    expect(checkContent("party-box", { kind: "letter", content: letterFixtures["party-box"] }, { giftRequired: true })).toEqual([])
  })

  it("never needs an event on a party box, which is an invitation only when it has one", () => {
    expect(checkContent("party-box", { kind: "letter", content: withoutEvent(letterFixtures["party-box"]) })).toEqual([])
  })

  it("needs the event on the 3D wedding envelope", () => {
    expect(checkContent("wedding-envelope-3d", { kind: "letter", content: withoutEvent(letterFixtures["wedding-envelope-3d"]) })).toEqual([
      "an invitation needs the event (title, startsAt, locationName, address)",
    ])
  })

  it("names every template that needs an event or a gift in the builder prompt", () => {
    expect(EVENT_TEMPLATES).toEqual(["wedding-invite", "party-invite", "wedding-envelope-3d", "wedding-invite-3d", "party-invite-3d"])
    expect(GIFT_TEMPLATES).toEqual(["gift-reveal", "gift-box-3d", "gift-3d"])
    expect(BUILDER_SYSTEM_PROMPT).toContain(`Invitations (${EVENT_TEMPLATES.join(", ")})`)
    expect(BUILDER_SYSTEM_PROMPT).toContain(`(${GIFT_TEMPLATES.join(", ")}) needs at least one gift`)
    expect(BUILDER_SYSTEM_PROMPT).toContain("A party pop box (party-box) needs one when the brief gives a gift.")
  })
})

describe("sanitize", () => {
  it("drops links that are not https", () => {
    const content = {
      ...letterFixtures["gift-reveal"],
      gifts: [{ title: "Spa", url: "javascript:alert(1)", imageUrl: "http://example.com/a.png", code: "ABC" }],
    }
    const result = sanitize({ kind: "letter", content }, "Europe/Berlin")
    expect(result.kind === "letter" && result.content.gifts[0]).toEqual({ title: "Spa", code: "ABC" })
  })

  it("numbers doors by position and replaces an unknown timezone", () => {
    const base = calendarFixtures.countdown
    const content = { ...base, timezone: "Mars/Olympus", doors: base.doors.map((d) => ({ ...d, day: 99 })) }
    const result = sanitize({ kind: "calendar", content }, "Europe/Berlin")
    if (result.kind !== "calendar") throw new Error("expected a calendar")
    expect(result.content.timezone).toBe("Europe/Berlin")
    expect(result.content.doors.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe("titleFor", () => {
  it("is generic: the kind and the first name, never the message", () => {
    expect(titleFor("classic-envelope", "Anna")).toBe("A letter for Anna")
    expect(titleFor("gift-reveal", "Tom")).toBe("A gift for Tom")
    expect(titleFor("wedding-invite", "Sophie")).toBe("An invitation for Sophie")
    expect(titleFor("advent-classic", "  Lena ")).toBe("An advent calendar for Lena")
  })

  it("keeps one person to the first name and a group whole, like page titles (issue #62)", () => {
    expect(titleFor("wedding-invite", "Sophie Meyer")).toBe("An invitation for Sophie")
    expect(titleFor("party-invite", "our friends")).toBe("An invitation for our friends")
    expect(titleFor("wedding-envelope-3d", "Mia & Leo")).toBe("An invitation for Mia & Leo")
    expect(titleFor("classic-envelope", "the Smiths")).toBe("A letter for the Smiths")
    expect(titleFor("classic-envelope", "  ")).toBe("A letter for someone")
  })

  it("calls the two gift boxes a gift and the 3D wedding envelope an invitation", () => {
    expect(titleFor("gift-box-3d", "Mara")).toBe("A gift for Mara")
    expect(titleFor("party-box", "Jonas")).toBe("A gift for Jonas")
    expect(titleFor("wedding-envelope-3d", "Everyone")).toBe("An invitation for Everyone")
    expect(titleFor("treasure-map", "Ana")).toBe("A letter for Ana")
  })
})

describe("BUILDER_SYSTEM_PROMPT", () => {
  it("has no per-request facts in it, so it stays the same on every request", () => {
    expect(BUILDER_SYSTEM_PROMPT).not.toContain(new Date().toISOString().slice(0, 10))
    expect(BUILDER_SYSTEM_PROMPT).not.toMatch(/today is/i)
  })
})

describe("the gift list and the builder", () => {
  it("is not part of the builder's output schema, so it can never invent or drop gifts", () => {
    expect(Object.keys(BuilderLetterContent.shape)).not.toContain("wishlist")
    expect(Object.keys(BuilderLetterContent.shape)).toContain("event")
  })

  it("is left out of the current content the builder sees when editing", () => {
    const shown = contentForBuilder(letterFixtures["party-invite"])
    expect(shown).not.toHaveProperty("wishlist")
    expect(shown).toMatchObject({ headline: letterFixtures["party-invite"].headline })
    expect(contentForBuilder(calendarFixtures.countdown)).toBe(calendarFixtures.countdown)
  })
})

// The builder streams (issue #30): these run the real SDK stream, its
// structured output parsing and the zod schema against replayed answers.
describe("buildContent, streamed", () => {
  const now = new Date("2026-11-21T12:00:00Z")
  const giftReveal = BuilderLetterContent.parse(letterFixtures["gift-reveal"])
  const answer = (content: unknown, stop_reason: "end_turn" | "max_tokens" | "refusal" = "end_turn"): Scripted => ({
    content: [{ type: "text", text: typeof content === "string" ? content : JSON.stringify(content) }],
    stop_reason,
  })

  function script(...replies: Scripted[]) {
    const requests: Array<Record<string, unknown>> = []
    vi.mocked(getClient).mockReturnValue(
      fakeClient(() => {
        const next = replies.shift()
        if (!next) throw new Error("no scripted answer left")
        return next
      }, requests),
    )
    return requests
  }

  // Records every draft, and how often the sink was restarted for a retry.
  function recorder() {
    const drafts: LetterDraft[] = []
    let clock = 0
    const inner = createDraftStream({ shape: toLetterDraft, emit: (d) => drafts.push(d), intervalMs: 0, now: () => clock++ })
    const sink: DraftSink & { restarts: number } = {
      restarts: 0,
      push: (delta) => inner.push(delta),
      flush: () => inner.flush(),
      restart: () => {
        sink.restarts++
        inner.restart()
      },
    }
    return { drafts, sink }
  }

  const userText = (request: Record<string, unknown>) => JSON.stringify(request.messages)

  it("streams the same structured output request and returns the validated, sanitised content", async () => {
    const requests = script(answer(giftReveal))
    const { drafts, sink } = recorder()
    const built = await buildContent({ mode: "build", templateId: "gift-reveal", brief: "For Mara", now, timezone: "Europe/Berlin", draft: sink })

    expect(built).toEqual(sanitize({ kind: "letter", content: giftReveal }, "Europe/Berlin"))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.stream).toBe(true)
    expect(requests[0]!.system).toBe(BUILDER_SYSTEM_PROMPT)
    expect(requests[0]!.output_config).toMatchObject({ effort: "low", format: { type: "json_schema" } })
    expect(requests[0]).not.toHaveProperty("temperature")

    // The draft grew in reading order and ended on the whole content, without codes or links.
    const firstWith = (key: keyof LetterDraft) => drafts.findIndex((d) => d[key] !== undefined)
    expect(drafts.length).toBeGreaterThan(5)
    expect(firstWith("headline")).toBeLessThan(firstWith("body"))
    expect(firstWith("body")).toBeLessThan(firstWith("gifts"))
    expect(drafts.at(-1)).toEqual(toLetterDraft(giftReveal))
    for (const gift of giftReveal.gifts) {
      if (gift.code) expect(JSON.stringify(drafts)).not.toContain(gift.code)
    }
    expect(sink.restarts).toBe(0)
  })

  it("builds without a draft sink, as the finder's wrap step does", async () => {
    script(answer(giftReveal))
    const built = await buildContent({ mode: "build", templateId: "gift-reveal", brief: "For Mara", now, timezone: "Europe/Berlin" })
    expect(built.kind).toBe("letter")
  })

  it("asks once more with the problems when the content does not fit, and the draft starts again", async () => {
    const requests = script(answer({ ...giftReveal, gifts: [] }), answer(giftReveal))
    const { sink } = recorder()
    const built = await buildContent({ mode: "build", templateId: "gift-reveal", brief: "For Mara", now, timezone: "Europe/Berlin", draft: sink })

    expect(built.content).toMatchObject({ headline: giftReveal.headline })
    expect(requests).toHaveLength(2)
    expect(userText(requests[1]!)).toContain("a gift reveal needs at least one gift")
    expect(sink.restarts).toBe(1)
  })

  it("gives up after the second answer that does not fit", async () => {
    script(answer({ ...giftReveal, gifts: [] }), answer({ ...giftReveal, gifts: [] }))
    await expect(buildContent({ mode: "build", templateId: "gift-reveal", brief: "For Mara", now, timezone: "Europe/Berlin" })).rejects.toBeInstanceOf(
      BuilderInvalidOutput,
    )
  })

  it("retries JSON that does not match the schema", async () => {
    const requests = script(answer({ recipientName: 5 }), answer(giftReveal))
    await buildContent({ mode: "build", templateId: "gift-reveal", brief: "For Mara", now, timezone: "Europe/Berlin" })
    expect(userText(requests[1]!)).toContain("the JSON did not match the schema")
  })

  it("tells a cut-off answer apart from bad JSON", async () => {
    const requests = script(answer(JSON.stringify(giftReveal).slice(0, 80), "max_tokens"), answer(giftReveal))
    await buildContent({ mode: "build", templateId: "gift-reveal", brief: "For Mara", now, timezone: "Europe/Berlin" })
    expect(userText(requests[1]!)).toContain("the answer was cut off")
  })

  it("throws a refusal as a refusal, even when its JSON is unfinished", async () => {
    const requests = script(answer('{"recipientName": "Ma', "refusal"))
    await expect(buildContent({ mode: "build", templateId: "gift-reveal", brief: "x", now, timezone: "Europe/Berlin" })).rejects.toBeInstanceOf(BuilderRefusal)
    expect(requests).toHaveLength(1)
  })

  it("passes API errors such as a spend limit to the caller without retrying", async () => {
    const requests = script({ status: 429, type: "rate_limit_error", message: "over the limit" })
    await expect(buildContent({ mode: "build", templateId: "gift-reveal", brief: "x", now, timezone: "Europe/Berlin" })).rejects.toBeInstanceOf(
      Anthropic.APIError,
    )
    expect(requests).toHaveLength(1)
  })
})
