import { describe, expect, it } from "vitest"
import {
  RECORDING_TYPES,
  VOICE_LIMITS,
  VOICE_MESSAGES,
  audioExtension,
  dailyLimitMessage,
  formatSeconds,
  languageHints,
  pickRecordingType,
} from "@/lib/voice/rules"

describe("languageHints", () => {
  it("turns the browser's languages into ISO 639-1 codes, first preference first", () => {
    expect(languageHints(["de-DE", "en-US", "en", "fr"])).toEqual(["de", "en", "fr"])
  })

  it("keeps at most three", () => {
    expect(languageHints(["de", "en", "fr", "es"])).toEqual(["de", "en", "fr"])
  })

  it("keeps the Chinese regions OpenAI knows", () => {
    expect(languageHints(["zh-TW", "zh-Hant", "zh-HK", "zh-CN", "zh"])).toEqual(["zh-tw", "zh-hk", "zh-cn"])
    expect(languageHints(["zh-Hans"])).toEqual(["zh"])
  })

  it("drops what OpenAI could reject the whole request for", () => {
    expect(languageHints(["x-klingon", "gsw", "", 42, null, "a".repeat(40), "en_GB"])).toEqual(["en"])
  })
})

describe("audioExtension", () => {
  it("names the formats MediaRecorder makes", () => {
    expect(audioExtension("audio/webm;codecs=opus")).toBe("webm")
    expect(audioExtension("audio/webm")).toBe("webm")
    expect(audioExtension("audio/mp4")).toBe("mp4")
    expect(audioExtension("audio/mp4;codecs=mp4a.40.2")).toBe("mp4")
    expect(audioExtension("AUDIO/MP4")).toBe("mp4")
  })

  it("accepts the other formats OpenAI reads", () => {
    expect(audioExtension("audio/x-m4a")).toBe("m4a")
    expect(audioExtension("audio/mpeg")).toBe("mp3")
    expect(audioExtension("audio/wav")).toBe("wav")
  })

  it("refuses what OpenAI cannot read", () => {
    expect(audioExtension("audio/ogg;codecs=opus")).toBeNull()
    expect(audioExtension("text/plain")).toBeNull()
    expect(audioExtension("")).toBeNull()
  })
})

describe("pickRecordingType", () => {
  it("prefers webm/opus (Chrome, Android, Firefox, newer Safari)", () => {
    expect(pickRecordingType(() => true)).toBe("audio/webm;codecs=opus")
  })

  it("falls back to mp4 on older iOS Safari", () => {
    expect(pickRecordingType((type) => type.startsWith("audio/mp4"))).toBe("audio/mp4;codecs=mp4a.40.2")
    expect(pickRecordingType((type) => type === "audio/mp4")).toBe("audio/mp4")
  })

  it("lets the browser choose when it supports none, and survives a throwing check", () => {
    expect(pickRecordingType(() => false)).toBe("")
    expect(
      pickRecordingType((type) => {
        if (type.includes("webm")) throw new Error("unknown type")
        return true
      }),
    ).toBe("audio/mp4;codecs=mp4a.40.2")
  })

  it("only ever asks for formats the route accepts", () => {
    for (const type of RECORDING_TYPES) expect(audioExtension(type)).not.toBeNull()
  })
})

describe("messages", () => {
  it("follow the brand voice: no exclamation marks, no emoji", () => {
    for (const message of [...Object.values(VOICE_MESSAGES), dailyLimitMessage("user_count"), dailyLimitMessage("user_seconds")]) {
      expect(message).not.toMatch(/!|\p{Extended_Pictographic}/u)
      expect(message).not.toMatch(/oops|magic|ai-powered|unlock/i)
    }
  })

  it("name the daily limit that was reached", () => {
    expect(dailyLimitMessage("user_count")).toContain(`${VOICE_LIMITS.recordingsPerDay} voice messages`)
    expect(dailyLimitMessage("user_seconds")).toContain("10 minutes")
  })
})

describe("formatSeconds", () => {
  it("shows minutes and seconds", () => {
    expect(formatSeconds(0)).toBe("0:00")
    expect(formatSeconds(7.9)).toBe("0:07")
    expect(formatSeconds(60)).toBe("1:00")
    expect(formatSeconds(-3)).toBe("0:00")
  })
})
