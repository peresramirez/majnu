// The voice player's sums (issue #83). The player itself is .tsx, which the
// test runner cannot load (tsconfig keeps JSX for Next.js); it is checked in
// the browser on /dev/templates?audio=1. These cover everything it computes.
import { describe, expect, it } from "vitest"
import { LETTER_TEMPLATE_IDS } from "@/lib/letters/schema"
import {
  BAR_COUNT,
  barBins,
  breathingLevels,
  isOwnAudioSrc,
  loudness,
  MIN_LEVEL,
  restShape,
  seedOf,
  settleLevels,
  stepLevels,
  templateHasVoiceSlot,
  timeText,
  VOICE_NOTE_IN_TEMPLATE,
  voiceSender,
  voiceStatus,
  voiceWords,
} from "@/components/letters/voice-player-model"

describe("which templates place the voice player", () => {
  it.each(LETTER_TEMPLATE_IDS)("%s places it in its own page, so it has no pill or band", (id) => {
    expect(VOICE_NOTE_IN_TEMPLATE[id]).toBe(true)
    expect(templateHasVoiceSlot(id)).toBe(true)
  })

  it("treats an unknown id as the classic envelope, which the renderer draws for it", () => {
    expect(templateHasVoiceSlot("not-a-template")).toBe(VOICE_NOTE_IN_TEMPLATE["classic-envelope"])
  })
})

describe("isOwnAudioSrc", () => {
  it.each(["/l/abc/audio?v=1f2e", "/api/letters/0b6c/audio/file?v=9", "/dev/voice-note.m4a"])("accepts a path on our own site: %s", (src) => {
    expect(isOwnAudioSrc(src)).toBe(true)
  })

  it.each([
    "https://evil.example/a.m4a",
    "//evil.example/a.m4a",
    "/\\evil.example/a.m4a",
    "data:audio/wav;base64,AAAA",
    "blob:https://majnu.app/1234",
    "javascript:alert(1)",
    "l/abc/audio",
    "/l/abc audio",
    "",
    null,
    undefined,
  ])("refuses anything else: %s", (src) => {
    expect(isOwnAudioSrc(src)).toBe(false)
  })
})

describe("the waveform at rest", () => {
  it("is the same for the same note, so the server and the browser draw the same bars", () => {
    const seed = seedOf("/l/abc/audio?v=1")
    expect(restShape(seed)).toEqual(restShape(seed))
  })

  it("differs between notes", () => {
    expect(restShape(seedOf("/l/abc/audio?v=1"))).not.toEqual(restShape(seedOf("/l/xyz/audio?v=2")))
  })

  it("has one bar per slot, between the floor and the top, rounded for stable markup", () => {
    for (const src of ["/l/a/audio", "/l/b/audio", "/dev/voice-note.m4a", "/l/d/audio?v=77"]) {
      const shape = restShape(seedOf(src))
      expect(shape).toHaveLength(BAR_COUNT)
      for (const level of shape) {
        expect(level).toBeGreaterThanOrEqual(MIN_LEVEL)
        expect(level).toBeLessThanOrEqual(0.92)
        expect(Math.round(level * 1000) / 1000).toBe(level)
      }
    }
  })

  it("is a gentle shape: lower at the ends than in the middle, with no sudden jumps", () => {
    const shape = restShape(seedOf("/dev/voice-note.m4a"))
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(mean([shape[0], shape[BAR_COUNT - 1]])).toBeLessThan(mean(shape.slice(10, 24)))
    for (let i = 1; i < shape.length; i++) expect(Math.abs(shape[i] - shape[i - 1])).toBeLessThan(0.3)
  })
})

describe("the waveform while playing", () => {
  const rest = restShape(seedOf("/dev/voice-note.m4a"))
  const bins = barBins(BAR_COUNT, 128)

  it("listens to the low part of the spectrum, where voices are, in a scattered order", () => {
    expect(bins).toHaveLength(BAR_COUNT)
    for (const bin of bins) {
      expect(bin).toBeGreaterThanOrEqual(1)
      expect(bin).toBeLessThanOrEqual(54)
    }
    const sorted = [...bins].sort((a, b) => a - b)
    expect(bins).not.toEqual(sorted)
    expect(barBins(BAR_COUNT, 128)).toEqual(bins)
  })

  it("measures loudness from the waveform: silence is 0, a loud voice reaches 1", () => {
    expect(loudness(new Uint8Array(256).fill(128))).toBe(0)
    const loud = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 128 + 90 : 128 - 90))
    expect(loudness(loud)).toBe(1)
    const soft = Uint8Array.from({ length: 256 }, (_, i) => (i % 2 ? 128 + 12 : 128 - 12))
    expect(loudness(soft)).toBeGreaterThan(0.2)
    expect(loudness(soft)).toBeLessThan(0.4)
    expect(loudness(new Uint8Array(0))).toBe(0)
  })

  it("rises with the sound and falls back in silence, never below the floor", () => {
    const levels = rest.slice()
    const loudSpectrum = new Uint8Array(128).fill(230)
    for (let frame = 0; frame < 20; frame++) stepLevels(levels, loudSpectrum, 0.9, rest, bins)
    const meanLoud = levels.reduce((a, b) => a + b, 0) / levels.length
    expect(meanLoud).toBeGreaterThan(0.7)

    const silent = new Uint8Array(128)
    for (let frame = 0; frame < 80; frame++) stepLevels(levels, silent, 0, rest, bins)
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(MIN_LEVEL - 1e-9)
      expect(level).toBeLessThan(0.15)
    }
  })

  it("rises faster than it falls, which reads as speech rather than flicker", () => {
    const up = [MIN_LEVEL]
    stepLevels(up, new Uint8Array(128).fill(255), 1, [0.5], [1])
    const down = [1]
    stepLevels(down, new Uint8Array(128), 0, [0.5], [1])
    expect(up[0] - MIN_LEVEL).toBeGreaterThan(1 - down[0])
  })

  it("breathes around the resting shape when there is no analyser", () => {
    const levels = rest.slice()
    for (let frame = 0; frame < 60; frame++) breathingLevels(levels, rest, frame / 60)
    expect(levels).not.toEqual(rest)
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(MIN_LEVEL - 1e-9)
      expect(level).toBeLessThanOrEqual(1)
    }
  })

  it("settles back to rest after a pause, and says when it is there", () => {
    const levels = rest.map(() => 1)
    let frames = 0
    while (!settleLevels(levels, rest)) frames++
    expect(levels).toEqual(rest)
    expect(frames).toBeGreaterThan(5)
    expect(frames).toBeLessThan(60)
  })
})

describe("the words", () => {
  it("names one person by the first name and a group whole", () => {
    expect(voiceSender("Sam Taylor")).toBe("Sam")
    expect(voiceSender("Lea and Max")).toBe("Lea and Max")
    expect(voiceSender("Mum")).toBe("Mum")
    expect(voiceSender("  ")).toBeNull()
    expect(voiceSender("")).toBeNull()
  })

  it("titles the player and names the button by what a tap does", () => {
    expect(voiceWords("Sam", false)).toEqual({
      title: "A voice note from Sam",
      action: "Play the voice note from Sam",
      captionLead: "Sam says: ",
    })
    expect(voiceWords("Sam", true).action).toBe("Pause the voice note from Sam")
    expect(voiceWords("Lea and Max", false).captionLead).toBe("Lea and Max say: ")
    expect(voiceWords(null, false)).toEqual({ title: "A voice note", action: "Play the voice note", captionLead: "The note says: " })
  })

  it("shows the length before it starts and the time left once it has", () => {
    expect(timeText(0, 42, false)).toBe("0:42")
    expect(timeText(0, 42.4, true)).toBe("-0:43")
    expect(timeText(12.2, 42, true)).toBe("-0:30")
    expect(timeText(41.9, 42, true)).toBe("-0:01")
    expect(timeText(43, 42, true)).toBe("-0:00")
    expect(timeText(0, 125, false)).toBe("2:05")
    expect(timeText(0, null, false)).toBe("")
    expect(timeText(5, null, true)).toBe("0:05")
  })

  it("tells the live region what happened, and nothing before the first tap", () => {
    expect(voiceStatus({ playing: false, failed: false, started: false }, "Sam")).toBe("")
    expect(voiceStatus({ playing: true, failed: false, started: true }, "Sam")).toBe("Playing the voice note from Sam.")
    expect(voiceStatus({ playing: true, failed: false, started: true }, null)).toBe("Playing the voice note.")
    expect(voiceStatus({ playing: false, failed: false, started: true }, "Sam")).toBe("Paused.")
    expect(voiceStatus({ playing: false, failed: true, started: true }, "Sam")).toMatch(/couldn't play/)
  })
})
