import { describe, expect, it } from "vitest"
import { fixtureLetter, sampleAudio, silentWav } from "@/app/dev/templates/fixture-letter"

describe("the workbench's sample voice note (?audio=1)", () => {
  it("is a valid, silent WAV served inline", () => {
    const src = silentWav()
    expect(src.startsWith("data:audio/wav;base64,")).toBe(true)
    const bytes = Buffer.from(src.slice(src.indexOf(",") + 1), "base64")
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF")
    expect(bytes.subarray(8, 12).toString("ascii")).toBe("WAVE")
    expect(bytes.readUInt32LE(4)).toBe(bytes.length - 8)
    expect(bytes.readUInt32LE(24)).toBe(8000)
    expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44)
    expect([...bytes.subarray(44)].every((b) => b === 128)).toBe(true)
  })

  it("comes with a length and a caption for the button", () => {
    expect(sampleAudio()).toMatchObject({ seconds: 1, caption: expect.stringContaining("silence") })
    const src = sampleAudio().src
    // One second at 8,000 samples a second, after the 44-byte header.
    expect(Buffer.from(src.slice(src.indexOf(",") + 1), "base64").length).toBe(44 + 8000)
  })
})

describe("fixtureLetter", () => {
  it("renders the owner's preview unless asked for the guest's page", () => {
    const now = new Date("2026-11-22T12:00:00Z")
    expect(fixtureLetter("wedding-envelope-3d", { now })?.ownerPreview).toBe(true)
    expect(fixtureLetter("wedding-envelope-3d", { now, guest: true })?.ownerPreview).toBe(false)
  })
})
