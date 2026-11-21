import Anthropic from "@anthropic-ai/sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/social/apify", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/social/apify")>()),
  readInstagramProfile: vi.fn(),
  readTikTokProfile: vi.fn(),
}))
vi.mock("@/lib/social/web", () => ({ readWebPage: vi.fn() }))
vi.mock("@/lib/social/interests", () => ({ extractInterests: vi.fn() }))

import { ProfileReadError, readInstagramProfile, readTikTokProfile } from "@/lib/social/apify"
import { extractInterests } from "@/lib/social/interests"
import { canReadSource, readProfileInterests } from "@/lib/social/read"
import { readWebPage } from "@/lib/social/web"

const PROFILE = { bio: "Secret bio text: climbing", posts: ["A private-sounding caption"], hashtags: ["climbing"] }
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv("APIFY_API_TOKEN", "apify-token")
  vi.stubEnv("TAVILY_API_KEY", "tavily-key")
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.mocked(readInstagramProfile).mockResolvedValue(PROFILE)
  vi.mocked(readTikTokProfile).mockResolvedValue(PROFILE)
  vi.mocked(readWebPage).mockResolvedValue({ posts: ["About me: climbing"], hashtags: [] })
  vi.mocked(extractInterests).mockResolvedValue(["Bouldern", "Kaffee", "Fotografie"])
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("readProfileInterests", () => {
  it("reads Instagram and TikTok with Apify and other pages with Tavily, and returns only the interests", async () => {
    expect(await readProfileInterests({ source: "instagram", username: "natgeo" }, "de")).toEqual({ ok: true, interests: ["Bouldern", "Kaffee", "Fotografie"] })
    expect(readInstagramProfile).toHaveBeenCalledWith("natgeo", "apify-token")
    expect(extractInterests).toHaveBeenCalledWith(PROFILE, "de")

    await readProfileInterests({ source: "tiktok", username: "khaby.lame" }, "en")
    expect(readTikTokProfile).toHaveBeenCalledWith("khaby.lame", "apify-token")

    await readProfileInterests({ source: "web", url: "https://anna-example.de/about" }, "en")
    expect(readWebPage).toHaveBeenCalledWith("https://anna-example.de/about", "tavily-key")
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
    expect(canReadSource("web")).toBe(true)
    expect(await readProfileInterests({ source: "tiktok", username: "x1" }, "en")).toEqual({ ok: false, reason: "blocked" })
    expect(readTikTokProfile).not.toHaveBeenCalled()
    vi.stubEnv("TAVILY_API_KEY", " ")
    expect(canReadSource("web")).toBe(false)
  })
})
