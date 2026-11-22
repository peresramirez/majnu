import Anthropic from "@anthropic-ai/sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/social/apify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social/apify")>()),
  readInstagramProfile: vi.fn(),
  readTikTokProfile: vi.fn(),
}))
vi.mock("@/lib/social/brightdata", () => ({ readInstagramWithBrightData: vi.fn(), readLinkedInProfile: vi.fn() }))
vi.mock("@/lib/social/web", () => ({ readWebPage: vi.fn() }))
vi.mock("@/lib/social/interests", () => ({ extractInterests: vi.fn() }))

import { ProfileReadError, readInstagramProfile, readTikTokProfile } from "@/lib/social/apify"
import { readInstagramWithBrightData, readLinkedInProfile } from "@/lib/social/brightdata"
import { extractInterests } from "@/lib/social/interests"
import { BRIGHTDATA_INSTAGRAM_MIN_MS, canReadSource, PROFILE_READ_TIMEOUT_MS, readProfileInterests } from "@/lib/social/read"
import { readWebPage } from "@/lib/social/web"

const PROFILE = { bio: "Secret bio text: climbing", posts: ["A private-sounding caption"], hashtags: ["climbing"] }
const LINKEDIN = { headline: "Product designer", background: ["Product designer, Example Bikes"], posts: [], hashtags: [] }
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("APIFY_API_TOKEN", "apify-token")
  vi.stubEnv("TAVILY_API_KEY", "tavily-key")
  // .env.local holds a real key: every test that wants Bright Data sets one.
  vi.stubEnv("BRIGHTDATA_API_KEY", "")
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.mocked(readInstagramProfile).mockResolvedValue(PROFILE)
  vi.mocked(readTikTokProfile).mockResolvedValue(PROFILE)
  vi.mocked(readInstagramWithBrightData).mockResolvedValue(PROFILE)
  vi.mocked(readLinkedInProfile).mockResolvedValue(LINKEDIN)
  vi.mocked(readWebPage).mockResolvedValue({ posts: ["About me: climbing"], hashtags: [] })
  vi.mocked(extractInterests).mockResolvedValue(["Bouldern", "Kaffee", "Fotografie"])
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe("readProfileInterests", () => {
  it("reads Instagram and TikTok with Apify and other pages with Tavily, and returns only the interests", async () => {
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: true, interests: ["Bouldern", "Kaffee", "Fotografie"] })
    expect(readInstagramProfile).toHaveBeenCalledWith("natgeo", "apify-token", expect.any(Number))
    expect(extractInterests).toHaveBeenCalledWith(PROFILE, "de")

    await readProfileInterests({ source: "tiktok", username: "khaby.lame" }, "en")
    expect(readTikTokProfile).toHaveBeenCalledWith("khaby.lame", "apify-token", expect.any(Number))

    await readProfileInterests({ source: "web", url: "https://anna-example.de/about" }, "en")
    expect(readWebPage).toHaveBeenCalledWith("https://anna-example.de/about", "tavily-key")
  })

  it("reads LinkedIn with Bright Data", async () => {
    vi.stubEnv("BRIGHTDATA_API_KEY", "bd-key")
    expect(await readProfileInterests({ source: "linkedin", username: "lena-example-1a2b3c" }, "de")).toEqual({
      ok: true,
      interests: ["Bouldern", "Kaffee", "Fotografie"],
    })
    expect(readLinkedInProfile).toHaveBeenCalledWith("lena-example-1a2b3c", "bd-key", expect.any(Number))
    expect(extractInterests).toHaveBeenCalledWith(LINKEDIN, "de")
  })

  it("gives the whole read one deadline", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-22T10:00:00Z"))
    vi.stubEnv("BRIGHTDATA_API_KEY", "bd-key")
    await readProfileInterests({ source: "linkedin", username: "lena-example-1a2b3c" }, "en")
    expect(vi.mocked(readLinkedInProfile).mock.calls[0][2]).toBe(Date.now() + PROFILE_READ_TIMEOUT_MS)
    expect(PROFILE_READ_TIMEOUT_MS).toBe(120_000)
  })

  it("fails politely, and logs only the source and the reason", async () => {
    vi.mocked(readInstagramProfile).mockRejectedValue(new ProfileReadError("private"))
    expect(await readProfileInterests({ source: "instagram", username: "anna.private" }, "de")).toEqual({ ok: false, reason: "private" })
    expect(extractInterests).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith("[social] profile read failed", { source: "instagram", reason: "private" })
    expect(JSON.stringify(warn.mock.calls)).not.toContain("anna.private")
  })

  it("treats a failed or empty interest step as a profile that could not be read, without logging what was read", async () => {
    vi.mocked(extractInterests).mockRejectedValueOnce(new Anthropic.APIError(529, undefined, "overloaded", new Headers()))
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: false, reason: "failed" })
    vi.mocked(extractInterests).mockResolvedValueOnce([])
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: false, reason: "empty" })
    const logged = JSON.stringify(warn.mock.calls)
    expect(logged).not.toMatch(/Secret bio|private-sounding|natgeo/)
  })

  it("needs a key for each kind of source", async () => {
    vi.stubEnv("APIFY_API_TOKEN", "")
    expect(canReadSource("instagram")).toBe(false)
    expect(canReadSource("tiktok")).toBe(false)
    expect(canReadSource("linkedin")).toBe(false)
    expect(canReadSource("web")).toBe(true)
    expect(await readProfileInterests({ source: "tiktok", username: "x1" }, "en")).toEqual({ ok: false, reason: "blocked" })
    expect(await readProfileInterests({ source: "linkedin", username: "lena-example" }, "en")).toEqual({ ok: false, reason: "blocked" })
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "en")).toEqual({ ok: false, reason: "blocked" })
    expect(readTikTokProfile).not.toHaveBeenCalled()
    expect(readLinkedInProfile).not.toHaveBeenCalled()
    expect(readInstagramWithBrightData).not.toHaveBeenCalled()
    vi.stubEnv("TAVILY_API_KEY", " ")
    expect(canReadSource("web")).toBe(false)

    // Bright Data alone reads LinkedIn and Instagram, not TikTok.
    vi.stubEnv("BRIGHTDATA_API_KEY", "bd-key")
    expect(canReadSource("linkedin")).toBe(true)
    expect(canReadSource("instagram")).toBe(true)
    expect(canReadSource("tiktok")).toBe(false)
  })
})

describe("Instagram's second route", () => {
  beforeEach(() => {
    vi.stubEnv("BRIGHTDATA_API_KEY", "bd-key")
  })

  it("is not used while Apify reads the profile", async () => {
    await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")
    expect(readInstagramWithBrightData).not.toHaveBeenCalled()
  })

  it.each(["blocked", "failed", "timeout"] as const)("reads with Bright Data when Apify failed with %s, within the same deadline", async (reason) => {
    vi.mocked(readInstagramProfile).mockRejectedValue(new ProfileReadError(reason, reason === "blocked" ? 402 : undefined))
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: true, interests: ["Bouldern", "Kaffee", "Fotografie"] })
    const deadline = vi.mocked(readInstagramProfile).mock.calls[0][2]
    expect(readInstagramWithBrightData).toHaveBeenCalledWith("natgeo", "bd-key", deadline)
    expect(warn).toHaveBeenCalledWith("[social] Apify could not read the profile, trying Bright Data", {
      source: "instagram",
      reason,
      ...(reason === "blocked" ? { status: 402 } : {}),
    })
    expect(JSON.stringify(warn.mock.calls)).not.toContain("natgeo")
  })

  it.each(["private", "not_found", "empty"] as const)("believes Apify when the profile itself is %s", async (reason) => {
    vi.mocked(readInstagramProfile).mockRejectedValue(new ProfileReadError(reason))
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: false, reason })
    expect(readInstagramWithBrightData).not.toHaveBeenCalled()
  })

  it("is not started when too little of the read's time is left for it to finish", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-22T10:00:00Z"))
    // Apify spends its full 70 s before giving up.
    vi.mocked(readInstagramProfile).mockImplementation(async () => {
      vi.setSystemTime(Date.now() + 70_000)
      throw new ProfileReadError("timeout")
    })
    expect(PROFILE_READ_TIMEOUT_MS - 70_000).toBeLessThan(BRIGHTDATA_INSTAGRAM_MIN_MS)
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: false, reason: "timeout" })
    expect(readInstagramWithBrightData).not.toHaveBeenCalled()
  })

  it("is the only route without an Apify token, and its failures are reported like any other", async () => {
    vi.stubEnv("APIFY_API_TOKEN", "")
    vi.mocked(readInstagramWithBrightData).mockRejectedValueOnce(new ProfileReadError("private"))
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: false, reason: "private" })
    expect(readInstagramProfile).not.toHaveBeenCalled()
    expect(readInstagramWithBrightData).toHaveBeenCalledWith("natgeo", "bd-key", expect.any(Number))
    expect(warn).toHaveBeenCalledWith("[social] profile read failed", { source: "instagram", reason: "private" })
  })

  it("reports Bright Data's failure when both routes fail", async () => {
    vi.mocked(readInstagramProfile).mockRejectedValue(new ProfileReadError("blocked", 402))
    vi.mocked(readInstagramWithBrightData).mockRejectedValue(new ProfileReadError("timeout"))
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: false, reason: "timeout" })
  })
})
