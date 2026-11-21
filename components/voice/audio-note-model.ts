// What the voice-note recorder (audio-note-recorder.tsx) shows, as a pure
// reducer, plus the calls it makes to /api/letters/<id>/audio. The recording
// itself is useVoiceRecorder's job (in its hand-back mode); this covers what
// happens around it: loading the saved note, listening back to a new one,
// saving, re-recording and removing.
//
//   loading ──loaded──▶ empty | saved
//   empty | saved ──recorded──▶ draft ──save──▶ saving ──saved──▶ saved
//                                 │ discard ▶ back        └─save_failed▶ draft
//   saved ──remove──▶ confirm ──confirm──▶ removing ──removed──▶ empty
//                       └─keep──▶ saved                 └─remove_failed▶ saved
import { NOTE_EXTENSIONS, OFFLINE_MESSAGE, noteOutcome, noteType, type AudioNoteSummary, type NoteOutcome } from "@/lib/audio/rules"
import type { Recording } from "./use-voice-recorder"

export type NoteNotice = { kind: "error"; message: string } | { kind: "saved" } | { kind: "removed" } | { kind: "discarded" }

export type NoteState =
  | { view: "loading" }
  | { view: "empty"; notice: NoteNotice | null }
  | { view: "saved"; note: AudioNoteSummary; notice: NoteNotice | null }
  | { view: "confirm_remove"; note: AudioNoteSummary }
  | { view: "removing"; note: AudioNoteSummary }
  // A new recording, not saved yet. `saved` is the note it would replace.
  | { view: "draft"; recording: Recording; saved: AudioNoteSummary | null; notice: NoteNotice | null }
  | { view: "saving"; recording: Recording; saved: AudioNoteSummary | null }

export type NoteEvent =
  | { type: "loaded"; note: AudioNoteSummary | null }
  | { type: "load_failed"; message: string }
  | { type: "recorded"; recording: Recording }
  | { type: "discard" }
  | { type: "save" }
  | { type: "saved"; note: AudioNoteSummary }
  | { type: "save_failed"; message: string }
  | { type: "remove" }
  | { type: "keep" }
  | { type: "confirm_remove" }
  | { type: "removed" }
  | { type: "remove_failed"; message: string }
  | { type: "dismiss" }

export function initialNoteState(initial: AudioNoteSummary | null | undefined): NoteState {
  if (initial === undefined) return { view: "loading" }
  return initial ? { view: "saved", note: initial, notice: null } : { view: "empty", notice: null }
}

function settled(note: AudioNoteSummary | null, notice: NoteNotice | null): NoteState {
  return note ? { view: "saved", note, notice } : { view: "empty", notice }
}

// The saved note behind any state, if there is one.
export function savedNote(state: NoteState): AudioNoteSummary | null {
  switch (state.view) {
    case "saved":
    case "confirm_remove":
    case "removing":
      return state.note
    case "draft":
    case "saving":
      return state.saved
    default:
      return null
  }
}

export function noteReducer(state: NoteState, event: NoteEvent): NoteState {
  switch (event.type) {
    case "loaded":
      return state.view === "loading" ? settled(event.note, null) : state
    case "load_failed":
      return state.view === "loading" ? { view: "empty", notice: { kind: "error", message: event.message } } : state
    case "recorded":
      // A new recording replaces any draft; it never replaces a save in flight.
      if (state.view === "saving" || state.view === "removing" || state.view === "loading") return state
      return { view: "draft", recording: event.recording, saved: savedNote(state), notice: null }
    case "discard":
      return state.view === "draft" ? settled(state.saved, { kind: "discarded" }) : state
    case "save":
      return state.view === "draft" ? { view: "saving", recording: state.recording, saved: state.saved } : state
    case "saved":
      return state.view === "saving" ? { view: "saved", note: event.note, notice: { kind: "saved" } } : state
    case "save_failed":
      return state.view === "saving"
        ? { view: "draft", recording: state.recording, saved: state.saved, notice: { kind: "error", message: event.message } }
        : state
    case "remove":
      return state.view === "saved" ? { view: "confirm_remove", note: state.note } : state
    case "keep":
      return state.view === "confirm_remove" ? { view: "saved", note: state.note, notice: null } : state
    case "confirm_remove":
      return state.view === "confirm_remove" ? { view: "removing", note: state.note } : state
    case "removed":
      return state.view === "removing" ? { view: "empty", notice: { kind: "removed" } } : state
    case "remove_failed":
      return state.view === "removing" ? { view: "saved", note: state.note, notice: { kind: "error", message: event.message } } : state
    case "dismiss":
      if (state.view === "empty" || state.view === "saved" || state.view === "draft") return { ...state, notice: null }
      return state
  }
}

// What the live region says after something happened.
export function noteStatus(state: NoteState, recipient: string | null): string {
  const who = recipient ?? "They"
  switch (state.view) {
    case "loading":
      return ""
    case "saving":
      return "Saving the voice note…"
    case "removing":
      return "Removing the voice note…"
    case "confirm_remove":
      return "Remove the voice note? The gift stays as it is."
    case "draft":
      return state.notice?.kind === "error" ? state.notice.message : ""
    case "empty":
    case "saved": {
      const notice = state.notice
      if (!notice) return ""
      if (notice.kind === "error") return notice.message
      if (notice.kind === "saved") return `Saved. ${who} can hear it with one tap on the gift.`
      if (notice.kind === "removed") return "The voice note is removed."
      return "The new recording was discarded."
    }
  }
}

// ---------- Talking to /api/letters/<id>/audio ----------

export type NoteApi = {
  load: (letterId: string) => Promise<NoteOutcome>
  save: (letterId: string, recording: Recording, languages: readonly string[]) => Promise<NoteOutcome>
  remove: (letterId: string) => Promise<NoteOutcome>
}

function noteUrl(letterId: string): string {
  return `/api/letters/${encodeURIComponent(letterId)}/audio`
}

// The upload: the recording (named for its format), its length and up to
// three of the browser's languages, which help the caption.
export function noteForm(recording: Recording, languages: readonly string[]): FormData {
  const form = new FormData()
  const type = noteType(recording.mimeType)
  form.append("audio", recording.blob, `note.${type ? NOTE_EXTENSIONS[type] : "webm"}`)
  form.append("duration", recording.seconds.toFixed(2))
  for (const language of languages.slice(0, 3)) if (language) form.append("language", language)
  return form
}

async function call(url: string, init: RequestInit): Promise<NoteOutcome> {
  let res: Response
  try {
    res = await fetch(url, { ...init, headers: { accept: "application/json" } })
  } catch {
    return { ok: false, code: "offline", message: OFFLINE_MESSAGE }
  }
  const body: unknown = await res.json().catch(() => null)
  return noteOutcome(res.status, body)
}

export const noteApi: NoteApi = {
  load: (letterId) => call(noteUrl(letterId), { method: "GET", cache: "no-store" }),
  save: (letterId, recording, languages) => call(noteUrl(letterId), { method: "POST", body: noteForm(recording, languages) }),
  remove: (letterId) => call(noteUrl(letterId), { method: "DELETE" }),
}
