// The microphone button's states, as a pure reducer so every transition can be
// unit-tested without a browser. use-voice-recorder.ts drives it from
// getUserMedia, MediaRecorder and the upload.
//
//   idle ──start──▶ starting ──started──▶ recording ──stop/limit──▶ transcribing ──transcribed──▶ idle
//                      │                     │  (too short: idle)        │
//                      └─start_failed▶ idle  └──cancel──▶ idle           └──failed / cancel──▶ idle
//
// `idle` carries what happened last (a finished transcription, a cancel or an
// error), which the button shows and its live region announces.
//
// The same machine records voice notes for gifts (components/voice/
// audio-note-recorder.tsx): `started` then carries a longer `limit`, and the
// recording is handed back instead of transcribed, so `transcribing` ends with
// `recorded` rather than `transcribed`. Without a limit everything behaves as
// for the message box: one minute, then transcription.
import {
  MAX_RECORDING_SECONDS,
  MIN_RECORDING_SECONDS,
  VOICE_MESSAGES,
  formatSeconds,
  type TranscribeErrorCode,
  type VoiceErrorCode,
} from "@/lib/voice/rules"

export type RecorderNotice =
  | { kind: "done" }
  | { kind: "cancelled" }
  | { kind: "error"; code: VoiceErrorCode; message: string }
  // A voice note was recorded and handed back (no transcription).
  | { kind: "recorded"; reachedLimit: boolean }

export type RecorderState =
  | { phase: "idle"; notice: RecorderNotice | null }
  | { phase: "starting" }
  // `startedAt` and `now` are milliseconds on one clock (performance.now()).
  // `limit` is the longest recording in seconds, when it is not the default.
  | { phase: "recording"; startedAt: number; now: number; limit?: number }
  | { phase: "transcribing"; seconds: number; reachedLimit: boolean; limit?: number }

export type RecorderEvent =
  | { type: "start" }
  | { type: "started"; at: number; limit?: number }
  | { type: "start_failed"; code: VoiceErrorCode }
  | { type: "tick"; at: number }
  // The recording ended: tapped stop, or reached the one-minute limit.
  | { type: "stop"; at: number }
  | { type: "cancel" }
  // MediaRecorder failed mid-recording (the microphone was unplugged or taken).
  | { type: "interrupted" }
  | { type: "transcribed"; text: string }
  // The recording was handed back to the caller instead of transcribed.
  | { type: "recorded" }
  | { type: "failed"; code: VoiceErrorCode; message?: string }
  | { type: "dismiss" }

export const initialRecorderState: RecorderState = { phase: "idle", notice: null }

export function elapsedSeconds(startedAt: number, at: number, limit: number = MAX_RECORDING_SECONDS): number {
  return Math.min(Math.max(0, (at - startedAt) / 1000), limit)
}

function limitOf(state: { limit?: number }): number {
  return state.limit ?? MAX_RECORDING_SECONDS
}

// "60 seconds", "2 minutes": how long one can talk, in the live region.
export function limitPhrase(limit: number): string {
  if (limit >= 120 && limit % 60 === 0) return `${limit / 60} minutes`
  return `${limit} seconds`
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five"]

// "one-minute", "two-minute": the limit as an adjective.
export function limitAdjective(limit: number): string {
  if (limit % 60 === 0 && limit / 60 < NUMBER_WORDS.length) return `${NUMBER_WORDS[limit / 60]}-minute`
  return `${limit}-second`
}

// A tap and a tap back: nothing worth sending.
export function isTooShort(seconds: number): boolean {
  return seconds < MIN_RECORDING_SECONDS
}

function error(code: VoiceErrorCode, message?: string): RecorderState {
  return { phase: "idle", notice: { kind: "error", code, message: message || VOICE_MESSAGES[code] } }
}

export function recorderReducer(state: RecorderState, event: RecorderEvent): RecorderState {
  switch (event.type) {
    case "start":
      return state.phase === "idle" ? { phase: "starting" } : state
    case "started":
      if (state.phase !== "starting") return state
      return event.limit ? { phase: "recording", startedAt: event.at, now: event.at, limit: event.limit } : { phase: "recording", startedAt: event.at, now: event.at }
    case "start_failed":
      return state.phase === "starting" ? error(event.code) : state
    case "tick":
      return state.phase === "recording" ? { ...state, now: Math.max(state.now, event.at) } : state
    case "stop": {
      if (state.phase !== "recording") return state
      const raw = (event.at - state.startedAt) / 1000
      if (isTooShort(raw)) return error("too_short")
      const limit = limitOf(state)
      const seconds = elapsedSeconds(state.startedAt, event.at, limit)
      const next = { phase: "transcribing" as const, seconds, reachedLimit: raw >= limit }
      return state.limit ? { ...next, limit: state.limit } : next
    }
    case "cancel":
      return state.phase === "idle" ? state : { phase: "idle", notice: { kind: "cancelled" } }
    case "interrupted":
      return state.phase === "recording" ? error("microphone_busy") : state
    case "transcribed":
      if (state.phase !== "transcribing") return state
      return event.text.trim() ? { phase: "idle", notice: { kind: "done" } } : error("nothing_heard")
    case "recorded":
      return state.phase === "transcribing" ? { phase: "idle", notice: { kind: "recorded", reachedLimit: state.reachedLimit } } : state
    case "failed":
      return state.phase === "transcribing" ? error(event.code, event.message) : state
    case "dismiss":
      return state.phase === "idle" ? { phase: "idle", notice: null } : state
  }
}

// Should the recording stop by itself now?
export function reachedLimit(state: RecorderState, at: number): boolean {
  return state.phase === "recording" && (at - state.startedAt) / 1000 >= limitOf(state)
}

const WARN_AT_SECONDS_LEFT = 10

// What the live region says. It changes only when something happens (and once
// ten seconds before the limit), never on every tick of the timer.
export function statusMessage(state: RecorderState): string {
  switch (state.phase) {
    case "starting":
      return "Asking for your microphone…"
    case "recording": {
      const limit = limitOf(state)
      const left = limit - elapsedSeconds(state.startedAt, state.now, limit)
      return left <= WARN_AT_SECONDS_LEFT
        ? `${WARN_AT_SECONDS_LEFT} seconds left.`
        : `Recording. Tap stop when you're done. You can talk for up to ${limitPhrase(limit)}.`
    }
    case "transcribing":
      return state.reachedLimit
        ? `That's the ${limitAdjective(limitOf(state))} limit. Writing down what you said…`
        : "Writing down what you said…"
    case "idle":
      if (!state.notice) return ""
      if (state.notice.kind === "done") return "Done. Check the text in the message box, then send it."
      if (state.notice.kind === "cancelled") return "Recording cancelled."
      if (state.notice.kind === "recorded") {
        return state.notice.reachedLimit
          ? "That's the limit, so the recording stopped. Listen back, then save it."
          : "Recorded. Listen back, then save it."
      }
      return state.notice.message
  }
}

// "0:12 / 1:00", for the timer on screen.
export function timerLabel(state: RecorderState): string {
  if (state.phase !== "recording") return ""
  const limit = limitOf(state)
  return `${formatSeconds(elapsedSeconds(state.startedAt, state.now, limit))} / ${formatSeconds(limit)}`
}

// getUserMedia's DOMException names, as the messages people see.
export function microphoneErrorCode(error: unknown): VoiceErrorCode {
  const name = error && typeof error === "object" && "name" in error ? String((error as { name: unknown }).name) : ""
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied"
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no_microphone"
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "microphone_busy"
    default:
      return "unsupported"
  }
}

const TRANSCRIBE_CODES: TranscribeErrorCode[] = [
  "session_required",
  "bad_request",
  "empty",
  "too_long",
  "too_large",
  "unsupported_format",
  "daily_limit",
  "site_busy",
  "unavailable",
  "failed",
]

export type TranscribeOutcome = { ok: true; text: string } | { ok: false; code: VoiceErrorCode; message?: string }

// What POST /api/transcribe answered, as an outcome. The route's message is
// used when it sends one (the daily limit names the limit reached).
export function transcribeOutcome(status: number, body: unknown): TranscribeOutcome {
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : {}
  if (status >= 200 && status < 300 && typeof record.text === "string") return { ok: true, text: record.text }
  const code = TRANSCRIBE_CODES.find((known) => known === record.error)
  const message = typeof record.message === "string" && record.message.length <= 300 ? record.message : undefined
  if (code) return { ok: false, code, message }
  if (status === 401) return { ok: false, code: "session_required" }
  if (status === 413) return { ok: false, code: "too_large" }
  if (status === 415) return { ok: false, code: "unsupported_format" }
  if (status === 429) return { ok: false, code: "daily_limit" }
  if (status === 503) return { ok: false, code: "unavailable" }
  return { ok: false, code: "failed" }
}
