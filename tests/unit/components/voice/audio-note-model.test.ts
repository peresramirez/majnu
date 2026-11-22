import { describe, expect, it } from "vitest"
import { canSaveRecording, initialNoteState, noteForm, noteReducer, noteStatus, savedNote, type NoteEvent, type NoteState } from "@/components/voice/audio-note-model"
import type { AudioNoteSummary } from "@/lib/audio/rules"

const note: AudioNoteSummary = { seconds: 42, caption: null, mimeType: "audio/mp4", sizeBytes: 9000, updatedAt: "2026-11-22T10:00:00Z", src: "/api/letters/x/audio/file?v=1" }
const newer: AudioNoteSummary = { ...note, seconds: 30, src: "/api/letters/x/audio/file?v=2" }
const recording = { blob: new Blob([new Uint8Array(10)], { type: "audio/mp4" }), seconds: 30.456, mimeType: "audio/mp4" }

function run(start: NoteState, ...events: NoteEvent[]): NoteState {
  return events.reduce(noteReducer, start)
}

describe("initialNoteState", () => {
  it("loads when the page did not say, else starts from what it knows", () => {
    expect(initialNoteState(undefined)).toEqual({ view: "loading" })
    expect(initialNoteState(null)).toEqual({ view: "empty", notice: null })
    expect(initialNoteState(note)).toEqual({ view: "saved", note, notice: null })
  })
})

describe("noteReducer", () => {
  it("saves a first note as soon as the recording stops, with no second tap", () => {
    const empty = initialNoteState(null)
    expect(canSaveRecording(empty)).toBe(true)
    const saving = run(empty, { type: "recorded", recording })
    expect(saving).toEqual({ view: "saving", recording, saved: null })
    expect(run(saving, { type: "saved", note })).toEqual({ view: "saved", note, notice: { kind: "saved" } })
  })

  it("re-records over a saved note, keeping the old one until the new one is saved", () => {
    const saving = run(initialNoteState(note), { type: "recorded", recording })
    expect(saving.view).toBe("saving")
    expect(savedNote(saving)).toBe(note)
    expect(run(saving, { type: "saved", note: newer })).toMatchObject({ view: "saved", note: newer })
  })

  it("after a failed save, tries again, records again or discards", () => {
    const draft = run(initialNoteState(note), { type: "recorded", recording }, { type: "save_failed", message: "No." })
    expect(draft).toMatchObject({ view: "draft", saved: note })
    expect(run(draft, { type: "save" }, { type: "saved", note: newer })).toMatchObject({ view: "saved", note: newer })
    expect(run(draft, { type: "recorded", recording }).view).toBe("saving")
    expect(run(draft, { type: "discard" })).toEqual({ view: "saved", note, notice: { kind: "discarded" } })
  })

  it("keeps the draft when saving fails, with the reason", () => {
    const failed = run(initialNoteState(note), { type: "recorded", recording }, { type: "save_failed", message: "No." })
    expect(failed).toEqual({ view: "draft", recording, saved: note, notice: { kind: "error", message: "No." } })
  })

  it("asks before removing, and can keep it", () => {
    const confirm = run(initialNoteState(note), { type: "remove" })
    expect(confirm).toEqual({ view: "confirm_remove", note })
    expect(run(confirm, { type: "keep" })).toEqual({ view: "saved", note, notice: null })
    expect(run(confirm, { type: "confirm_remove" }, { type: "removed" })).toEqual({ view: "empty", notice: { kind: "removed" } })
    expect(run(confirm, { type: "confirm_remove" }, { type: "remove_failed", message: "Later." })).toEqual({
      view: "saved",
      note,
      notice: { kind: "error", message: "Later." },
    })
  })

  it("ignores events that do not fit: no new recording while saving or removing", () => {
    const saving = run(initialNoteState(null), { type: "recorded", recording })
    expect(canSaveRecording(saving)).toBe(false)
    expect(run(saving, { type: "recorded", recording })).toBe(saving)
    const removing = run(initialNoteState(note), { type: "remove" }, { type: "confirm_remove" })
    expect(run(removing, { type: "recorded", recording })).toBe(removing)
    expect(run(initialNoteState(null), { type: "save" })).toEqual(initialNoteState(null))
    expect(run(initialNoteState(null), { type: "remove" })).toEqual(initialNoteState(null))
  })

  it("shows nothing for a gift that cannot have a note", () => {
    const unavailable = run({ view: "loading" }, { type: "not_available" })
    expect(unavailable).toEqual({ view: "unavailable" })
    expect(run(unavailable, { type: "recorded", recording })).toBe(unavailable)
    expect(noteStatus(unavailable, "Anna")).toBe("")
  })

  it("loads once", () => {
    expect(run({ view: "loading" }, { type: "loaded", note })).toEqual({ view: "saved", note, notice: null })
    expect(run({ view: "loading" }, { type: "loaded", note: null })).toEqual({ view: "empty", notice: null })
    expect(run({ view: "loading" }, { type: "load_failed", message: "Offline." })).toEqual({ view: "empty", notice: { kind: "error", message: "Offline." } })
    expect(run(initialNoteState(note), { type: "loaded", note: null })).toEqual(initialNoteState(note))
  })
})

describe("noteStatus", () => {
  it("names the recipient when it can, without guessing pronouns", () => {
    const saved = run(initialNoteState(null), { type: "recorded", recording }, { type: "save" }, { type: "saved", note })
    expect(noteStatus(saved, "Anna")).toBe("Saved. Anna can hear it with one tap on the gift.")
    expect(noteStatus(saved, null)).toBe("Saved. They can hear it with one tap on the gift.")
    expect(noteStatus(run(initialNoteState(note), { type: "remove" }, { type: "confirm_remove" }, { type: "removed" }), null)).toBe("The voice note is removed.")
  })
})

describe("noteForm", () => {
  it("sends the recording named for its format, its length and up to three languages", () => {
    const form = noteForm(recording, ["de-DE", "en-GB", "en", "fr"])
    const file = form.get("audio") as File
    expect(file.name).toBe("note.m4a")
    expect(file.type).toBe("audio/mp4")
    expect(form.get("duration")).toBe("30.46")
    expect(form.getAll("language")).toEqual(["de-DE", "en-GB", "en"])
    const webm = noteForm({ ...recording, blob: new Blob([], { type: "audio/webm;codecs=opus" }), mimeType: "audio/webm;codecs=opus" }, [])
    expect((webm.get("audio") as File).name).toBe("note.webm")
  })
})
