// The recorder's options for voice notes in gifts: a longer limit and a
// recording handed back instead of transcribed. The message box's behaviour
// (no limit given) is covered, unchanged, in recorder-state.test.ts.
import { describe, expect, it } from "vitest"
import {
  initialRecorderState,
  limitAdjective,
  limitPhrase,
  reachedLimit,
  recorderReducer,
  statusMessage,
  timerLabel,
  type RecorderEvent,
  type RecorderState,
} from "@/components/voice/recorder-state"
import { NOTE_RECORDING_TYPES } from "@/lib/audio/rules"
import { RECORDING_TYPES, pickRecordingType } from "@/lib/voice/rules"

function run(...events: RecorderEvent[]): RecorderState {
  return events.reduce(recorderReducer, initialRecorderState)
}

describe("a two-minute limit", () => {
  const recording = () => run({ type: "start" }, { type: "started", at: 0, limit: 120 })

  it("carries the limit on the recording", () => {
    expect(recording()).toEqual({ phase: "recording", startedAt: 0, now: 0, limit: 120 })
  })

  it("does not stop at one minute, and does at two", () => {
    expect(reachedLimit(recording(), 61_000)).toBe(false)
    expect(reachedLimit(recording(), 120_000)).toBe(true)
  })

  it("shows the timer against two minutes", () => {
    const state = recorderReducer(recording(), { type: "tick", at: 75_000 })
    expect(timerLabel(state)).toBe("1:15 / 2:00")
  })

  it("says how long one can talk, and warns ten seconds before the end", () => {
    expect(statusMessage(recording())).toBe("Recording. Tap stop when you're done. You can talk for up to 2 minutes.")
    expect(statusMessage(recorderReducer(recording(), { type: "tick", at: 111_000 }))).toBe("10 seconds left.")
    expect(statusMessage(recorderReducer(recording(), { type: "tick", at: 61_000 }))).not.toBe("10 seconds left.")
  })

  it("keeps up to two minutes of length when it stops", () => {
    expect(recorderReducer(recording(), { type: "stop", at: 90_000 })).toEqual({ phase: "transcribing", seconds: 90, reachedLimit: false, limit: 120 })
    expect(recorderReducer(recording(), { type: "stop", at: 125_000 })).toEqual({ phase: "transcribing", seconds: 120, reachedLimit: true, limit: 120 })
  })

  it("still discards a slip", () => {
    expect(recorderReducer(recording(), { type: "stop", at: 300 })).toMatchObject({ phase: "idle", notice: { kind: "error", code: "too_short" } })
  })
})

describe("handing the recording back", () => {
  it("ends with `recorded` instead of a transcription", () => {
    const stopped = run({ type: "start" }, { type: "started", at: 0, limit: 120 }, { type: "stop", at: 20_000 })
    expect(recorderReducer(stopped, { type: "recorded" })).toEqual({ phase: "idle", notice: { kind: "recorded", reachedLimit: false } })
    expect(statusMessage(recorderReducer(stopped, { type: "recorded" }))).toBe("Recorded. Listen back, then save it.")
  })

  it("says so when the limit stopped it", () => {
    const atLimit = run({ type: "start" }, { type: "started", at: 0, limit: 120 }, { type: "stop", at: 120_000 }, { type: "recorded" })
    expect(atLimit).toEqual({ phase: "idle", notice: { kind: "recorded", reachedLimit: true } })
    expect(statusMessage(atLimit)).toBe("That's the limit, so the recording stopped. Listen back, then save it.")
  })

  it("is ignored outside the step after stop", () => {
    expect(recorderReducer(initialRecorderState, { type: "recorded" })).toBe(initialRecorderState)
    const rec = run({ type: "start" }, { type: "started", at: 0 })
    expect(recorderReducer(rec, { type: "recorded" })).toBe(rec)
  })
})

describe("without a limit, the message box is unchanged", () => {
  it("keeps the one-minute wording and no limit field", () => {
    const rec = run({ type: "start" }, { type: "started", at: 0 })
    expect(rec).toStrictEqual({ phase: "recording", startedAt: 0, now: 0 })
    expect(statusMessage(rec)).toBe("Recording. Tap stop when you're done. You can talk for up to 60 seconds.")
    expect(timerLabel(rec)).toBe("0:00 / 1:00")
    const stopped = recorderReducer(rec, { type: "stop", at: 60_000 })
    expect(stopped).toStrictEqual({ phase: "transcribing", seconds: 60, reachedLimit: true })
    expect(statusMessage(stopped)).toBe("That's the one-minute limit. Writing down what you said…")
  })

  it("words limits as people say them", () => {
    expect(limitPhrase(60)).toBe("60 seconds")
    expect(limitPhrase(120)).toBe("2 minutes")
    expect(limitPhrase(90)).toBe("90 seconds")
    expect(limitAdjective(60)).toBe("one-minute")
    expect(limitAdjective(120)).toBe("two-minute")
    expect(limitAdjective(45)).toBe("45-second")
  })
})

describe("recording formats", () => {
  it("picks mp4 first for voice notes, webm first for the message box", () => {
    const chrome = (type: string) => type.startsWith("audio/webm") || type.startsWith("audio/mp4")
    expect(pickRecordingType(chrome, NOTE_RECORDING_TYPES)).toBe("audio/mp4;codecs=mp4a.40.2")
    expect(pickRecordingType(chrome)).toBe(RECORDING_TYPES[0])
    const firefox = (type: string) => type.startsWith("audio/ogg") || type.startsWith("audio/webm")
    expect(pickRecordingType(firefox, NOTE_RECORDING_TYPES)).toBe("audio/webm;codecs=opus")
    const oggOnly = (type: string) => type.startsWith("audio/ogg")
    expect(pickRecordingType(oggOnly, NOTE_RECORDING_TYPES)).toBe("audio/ogg;codecs=opus")
  })
})
