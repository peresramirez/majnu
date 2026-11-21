import { describe, expect, it } from "vitest"
import {
  initialRecorderState,
  microphoneErrorCode,
  reachedLimit,
  recorderReducer,
  statusMessage,
  timerLabel,
  transcribeOutcome,
  type RecorderEvent,
  type RecorderState,
} from "@/components/voice/recorder-state"
import { VOICE_MESSAGES } from "@/lib/voice/rules"

function run(...events: RecorderEvent[]): RecorderState {
  return events.reduce(recorderReducer, initialRecorderState)
}

const recording = (startedAt = 1000) => run({ type: "start" }, { type: "started", at: startedAt })

describe("recorderReducer", () => {
  it("goes idle → asking → recording → transcribing → done", () => {
    let state = run({ type: "start" })
    expect(state).toEqual({ phase: "starting" })
    state = recorderReducer(state, { type: "started", at: 1000 })
    expect(state).toEqual({ phase: "recording", startedAt: 1000, now: 1000 })
    state = recorderReducer(state, { type: "tick", at: 5000 })
    expect(timerLabel(state)).toBe("0:04 / 1:00")
    state = recorderReducer(state, { type: "stop", at: 13_500 })
    expect(state).toEqual({ phase: "transcribing", seconds: 12.5, reachedLimit: false })
    state = recorderReducer(state, { type: "transcribed", text: "Find a gift for my mum" })
    expect(state).toEqual({ phase: "idle", notice: { kind: "done" } })
    expect(statusMessage(state)).toBe("Done. Check the text in the message box, then send it.")
  })

  it("explains a denied microphone and does not record", () => {
    const state = run({ type: "start" }, { type: "start_failed", code: "denied" })
    expect(state).toEqual({ phase: "idle", notice: { kind: "error", code: "denied", message: VOICE_MESSAGES.denied } })
    expect(statusMessage(state)).toContain("Allow it for this site")
  })

  it("throws away a slip of the finger instead of sending it", () => {
    const state = recorderReducer(recording(1000), { type: "stop", at: 1300 })
    expect(state).toMatchObject({ phase: "idle", notice: { kind: "error", code: "too_short" } })
  })

  it("stops at the one-minute limit and still uses the recording", () => {
    let state = recording(1000)
    expect(reachedLimit(state, 60_999)).toBe(false)
    expect(reachedLimit(state, 61_000)).toBe(true)
    state = recorderReducer(state, { type: "stop", at: 61_200 })
    expect(state).toEqual({ phase: "transcribing", seconds: 60, reachedLimit: true })
    expect(statusMessage(state)).toBe("That's the one-minute limit. Writing down what you said…")
  })

  it("warns ten seconds before the limit, once, not on every tick", () => {
    const early = recorderReducer(recording(0), { type: "tick", at: 20_000 })
    expect(statusMessage(early)).toContain("Recording.")
    const late = recorderReducer(recording(0), { type: "tick", at: 50_000 })
    const later = recorderReducer(late, { type: "tick", at: 55_000 })
    expect(statusMessage(late)).toBe("10 seconds left.")
    expect(statusMessage(later)).toBe(statusMessage(late))
  })

  it("never shows more than the limit on the timer", () => {
    const state = recorderReducer(recording(0), { type: "tick", at: 75_000 })
    expect(timerLabel(state)).toBe("1:00 / 1:00")
  })

  it("cancels from asking, recording or transcribing", () => {
    const cancel: RecorderEvent = { type: "cancel" }
    expect(run({ type: "start" }, cancel)).toEqual({ phase: "idle", notice: { kind: "cancelled" } })
    expect(recorderReducer(recording(), cancel)).toEqual({ phase: "idle", notice: { kind: "cancelled" } })
    const transcribing = recorderReducer(recording(0), { type: "stop", at: 3000 })
    expect(recorderReducer(transcribing, cancel)).toEqual({ phase: "idle", notice: { kind: "cancelled" } })
    expect(statusMessage(recorderReducer(recording(), cancel))).toBe("Recording cancelled.")
  })

  it("ignores a late answer after a cancel", () => {
    const cancelled = recorderReducer(recorderReducer(recording(0), { type: "stop", at: 3000 }), { type: "cancel" })
    expect(recorderReducer(cancelled, { type: "transcribed", text: "late" })).toBe(cancelled)
    expect(recorderReducer(cancelled, { type: "failed", code: "failed" })).toBe(cancelled)
  })

  it("says so when no words were heard", () => {
    const state = recorderReducer(recorderReducer(recording(0), { type: "stop", at: 3000 }), { type: "transcribed", text: "  " })
    expect(state).toMatchObject({ phase: "idle", notice: { kind: "error", code: "nothing_heard" } })
  })

  it("shows the route's own message for a failed transcription", () => {
    const transcribing = recorderReducer(recording(0), { type: "stop", at: 3000 })
    const limited = recorderReducer(transcribing, { type: "failed", code: "daily_limit", message: "You have sent 20 voice messages today." })
    expect(statusMessage(limited)).toBe("You have sent 20 voice messages today.")
    const generic = recorderReducer(transcribing, { type: "failed", code: "failed" })
    expect(statusMessage(generic)).toBe(VOICE_MESSAGES.failed)
  })

  it("reports a microphone lost mid-recording", () => {
    expect(recorderReducer(recording(), { type: "interrupted" })).toMatchObject({ notice: { code: "microphone_busy" } })
  })

  it("does not start twice, and ignores events that do not fit the phase", () => {
    const state = recording()
    expect(recorderReducer(state, { type: "start" })).toBe(state)
    expect(recorderReducer(state, { type: "started", at: 9 })).toBe(state)
    expect(recorderReducer(initialRecorderState, { type: "stop", at: 9 })).toBe(initialRecorderState)
    expect(recorderReducer(initialRecorderState, { type: "tick", at: 9 })).toBe(initialRecorderState)
    expect(recorderReducer(initialRecorderState, { type: "cancel" })).toBe(initialRecorderState)
  })

  it("clears an error when dismissed or on the next start", () => {
    const failed = run({ type: "start" }, { type: "start_failed", code: "no_microphone" })
    expect(recorderReducer(failed, { type: "dismiss" })).toEqual(initialRecorderState)
    expect(recorderReducer(failed, { type: "start" })).toEqual({ phase: "starting" })
    expect(statusMessage(initialRecorderState)).toBe("")
  })
})

describe("microphoneErrorCode", () => {
  it("maps getUserMedia's errors to what people can do about them", () => {
    expect(microphoneErrorCode(new DOMException("denied", "NotAllowedError"))).toBe("denied")
    expect(microphoneErrorCode(new DOMException("insecure", "SecurityError"))).toBe("denied")
    expect(microphoneErrorCode(new DOMException("none", "NotFoundError"))).toBe("no_microphone")
    expect(microphoneErrorCode(new DOMException("busy", "NotReadableError"))).toBe("microphone_busy")
    expect(microphoneErrorCode(new TypeError("no mediaDevices"))).toBe("unsupported")
    expect(microphoneErrorCode(undefined)).toBe("unsupported")
  })
})

describe("transcribeOutcome", () => {
  it("reads the text", () => {
    expect(transcribeOutcome(200, { text: "Hallo" })).toEqual({ ok: true, text: "Hallo" })
  })

  it("reads the route's error code and message", () => {
    expect(transcribeOutcome(429, { error: "daily_limit", message: "You have sent 20 voice messages today." })).toEqual({
      ok: false,
      code: "daily_limit",
      message: "You have sent 20 voice messages today.",
    })
  })

  it("falls back on the status when the body is not ours", () => {
    expect(transcribeOutcome(401, null)).toEqual({ ok: false, code: "session_required" })
    expect(transcribeOutcome(413, "Payload Too Large")).toEqual({ ok: false, code: "too_large" })
    expect(transcribeOutcome(429, {})).toEqual({ ok: false, code: "daily_limit" })
    expect(transcribeOutcome(500, { error: "something else" })).toEqual({ ok: false, code: "failed" })
    expect(transcribeOutcome(200, { nope: true })).toEqual({ ok: false, code: "failed" })
  })
})
