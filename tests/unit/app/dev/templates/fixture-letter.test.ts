import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { fixtureLetter, SAMPLE_AUDIO_PATH, sampleAudio } from "@/app/dev/templates/fixture-letter"
import { isOwnAudioSrc } from "@/components/letters/voice-player-model"

describe("the workbench's sample voice note (?audio=1)", () => {
  it("is an AAC file in public/dev, served from our own domain", () => {
    const note = sampleAudio()
    expect(note.src).toBe(SAMPLE_AUDIO_PATH)
    expect(isOwnAudioSrc(note.src)).toBe(true)
    const bytes = readFileSync(join(process.cwd(), "public", SAMPLE_AUDIO_PATH))
    // An MP4 container: the "ftyp" box comes first.
    expect(bytes.subarray(4, 8).toString("ascii")).toBe("ftyp")
    expect(bytes.length).toBeLessThan(100_000)
  })

  it("comes with its length and a caption for the button", () => {
    expect(sampleAudio()).toMatchObject({ seconds: 7, caption: expect.stringContaining("voice note") })
  })
})

describe("fixtureLetter", () => {
  it("renders the owner's preview unless asked for the guest's page", () => {
    const now = new Date("2026-11-22T12:00:00Z")
    expect(fixtureLetter("wedding-envelope-3d", { now })?.ownerPreview).toBe(true)
    expect(fixtureLetter("wedding-envelope-3d", { now, guest: true })?.ownerPreview).toBe(false)
  })
})
