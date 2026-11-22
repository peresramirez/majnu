import { describe, expect, it } from "vitest"
import { draftReducer, initialDraftState, type DraftState } from "@/components/create/draft-state"
import type { ChatEvent } from "@/lib/agents/events"

const draft = (headline: string): ChatEvent => ({ type: "draft", letterId: "l1", kind: "letter", templateId: "classic-envelope", content: { headline } })
const preview: ChatEvent = { type: "preview", letterId: "l1", kind: "letter", templateId: "classic-envelope" }

function run(events: Array<ChatEvent | "ended" | "shown">, from: DraftState = initialDraftState): DraftState {
  return events.reduce<DraftState>(
    (state, e) => draftReducer(state, e === "ended" || e === "shown" ? { type: e } : { type: "event", event: e }),
    from,
  )
}

describe("draftReducer", () => {
  it("replaces the draft with every draft event and counts the changes", () => {
    const state = run([draft("Hap"), draft("Happy birthday")])
    expect(state.draft).toEqual({ kind: "letter", templateId: "classic-envelope", content: { headline: "Happy birthday" }, phase: "writing" })
    expect(state.changes).toBe(2)
  })

  it("keeps a saved draft on screen until the reloaded preview has loaded", () => {
    const saved = run([draft("Hi"), preview, { type: "tool", name: "build_letter", status: "done", label: "Writing your letter…" }, { type: "done" }])
    expect(saved.draft?.phase).toBe("saved")
    expect(run(["shown"], saved).draft).toBeNull()
  })

  it("does not let a preview that loads mid-edit hide the draft being written", () => {
    const writing = run([draft("Hi"), preview, draft("Hello")])
    expect(run(["shown"], writing).draft).toMatchObject({ phase: "writing", content: { headline: "Hello" } })
  })

  it("drops a draft that was never saved: a failed build, an error, a refusal or a turn that ended", () => {
    const failed: ChatEvent = { type: "tool", name: "edit_letter", status: "error", label: "Something went wrong making the changes." }
    expect(run([draft("Hi"), failed]).draft).toBeNull()
    expect(run([draft("Hi"), { type: "error", message: "x" }]).draft).toBeNull()
    expect(run([draft("Hi"), { type: "refusal", message: "x" }]).draft).toBeNull()
    expect(run([draft("Hi"), { type: "done" }]).draft).toBeNull()
    expect(run([draft("Hi"), "ended"]).draft).toBeNull()
  })

  it("ignores other tools and events", () => {
    const state = run([draft("Hi"), { type: "tool", name: "update_gift_list", status: "error", label: "x" }, { type: "text", delta: "ok" }])
    expect(state.draft?.phase).toBe("writing")
    // A preview with no draft (the gift list changed) leaves nothing to show.
    expect(run([preview]).draft).toBeNull()
  })
})
