import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import {
  APIFY_ACTORS,
  instagramText,
  MAX_CHARGE_USD,
  ProfileReadError,
  readInstagramProfile,
  readTikTokProfile,
  RUN_TIMEOUT_SECS,
  scrub,
  TIKTOK_VIDEOS,
  tiktokText,
} from "@/lib/social/apify"

const TOKEN = "apify_api_test_token"

const INSTAGRAM_ITEM = {
  username: "natgeo",
  private: false,
  biography: "Experience the world through the eyes of National Geographic photographers. Write to press@natgeo.com",
  businessCategoryName: "Media/News Company",
  followersCount: 280_000_000,
  relatedProfiles: [{ username: "someone" }],
  latestPosts: [
    { caption: "Into the reef with @nasahubble #ocean #coral https://ngm.com/reef", hashtags: ["ocean", "coral"], mentions: ["nasahubble"] },
    { caption: "A snow leopard at dawn. #wildlife #ocean", hashtags: ["wildlife", "ocean"] },
    { caption: null, hashtags: null },
  ],
}

function jsonResponse(body: unknown, status = 201): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe("the Apify request", () => {
  it("runs the official Instagram profile scraper synchronously, with the token in a header and a cost cap", async () => {
    fetchMock.mockResolvedValue(jsonResponse([INSTAGRAM_ITEM]))
    await readInstagramProfile("natgeo", TOKEN)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const parsed = new URL(url)
    expect(`${parsed.origin}${parsed.pathname}`).toBe(`https://api.apify.com/v2/acts/${APIFY_ACTORS.instagram}/run-sync-get-dataset-items`)
    expect(APIFY_ACTORS.instagram).toBe("apify~instagram-profile-scraper")
    expect(url).not.toContain(TOKEN)
    expect(parsed.searchParams.get("token")).toBeNull()
    expect(parsed.searchParams.get("timeout")).toBe(String(RUN_TIMEOUT_SECS))
    expect(parsed.searchParams.get("maxTotalChargeUsd")).toBe(String(MAX_CHARGE_USD))
    // Only the fields we read: never followers, related profiles or contact details.
    const fields = parsed.searchParams.get("fields")!.split(",")
    expect(fields).toContain("biography")
    expect(fields).toContain("latestPosts")
    expect(fields).not.toContain("followersCount")
    expect(fields).not.toContain("relatedProfiles")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(init.body as string)).toEqual({ usernames: ["natgeo"] })
  })

  it("asks the TikTok profile scraper for ten videos and no downloads", async () => {
    fetchMock.mockResolvedValue(jsonResponse([{ text: "Bouldering day #climbing", hashtags: [{ name: "climbing" }], authorMeta: { signature: "Climber" } }]))
    await readTikTokProfile("khaby.lame", TOKEN)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(new URL(url).pathname).toBe(`/v2/acts/${APIFY_ACTORS.tiktok}/run-sync-get-dataset-items`)
    expect(APIFY_ACTORS.tiktok).toBe("clockworks~tiktok-profile-scraper")
    const input = JSON.parse(init.body as string)
    expect(input).toMatchObject({
      profiles: ["khaby.lame"],
      resultsPerPage: TIKTOK_VIDEOS,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadAvatars: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
      maxFollowersPerProfile: 0,
      maxFollowingPerProfile: 0,
      commentsPerPost: 0,
    })
    expect(TIKTOK_VIDEOS).toBe(10)
  })

  it.each([
    [408, "timeout"],
    [402, "blocked"],
    [403, "blocked"],
    [429, "blocked"],
    [400, "failed"],
    [500, "failed"],
  ])("turns HTTP %i into %s", async (status, reason) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { type: "run-failed", message: "x" } }, status))
    await expect(readInstagramProfile("natgeo", TOKEN)).rejects.toMatchObject({ reason, status })
  })

  it("gives up when Apify cannot be reached or answers something that is not a list", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"))
    await expect(readInstagramProfile("natgeo", TOKEN)).rejects.toMatchObject({ reason: "failed" })
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: "no" }))
    await expect(readInstagramProfile("natgeo", TOKEN)).rejects.toMatchObject({ reason: "failed" })
  })

  it("aborts a run that takes too long", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    )
    const pending = expect(readInstagramProfile("natgeo", TOKEN)).rejects.toMatchObject({ reason: "timeout" })
    await vi.advanceTimersByTimeAsync(71_000)
    await pending
  })

  it("gives up at the read's deadline when that comes first, and does not start after it", async () => {
    vi.useFakeTimers()
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    )
    const pending = expect(readInstagramProfile("natgeo", TOKEN, Date.now() + 10_000)).rejects.toMatchObject({ reason: "timeout" })
    await vi.advanceTimersByTimeAsync(10_001)
    await pending
    fetchMock.mockClear()
    await expect(readTikTokProfile("natgeo", TOKEN, Date.now() - 1)).rejects.toMatchObject({ reason: "timeout" })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("what is kept of an Instagram profile", () => {
  it("keeps the bio, the category, captions and the most used hashtags, without links, e-mail addresses or handles", () => {
    const text = instagramText([INSTAGRAM_ITEM])
    expect(text.bio).toContain("National Geographic photographers")
    expect(text.bio).not.toContain("press@natgeo.com")
    expect(text.category).toBe("Media/News Company")
    expect(text.posts).toHaveLength(2)
    expect(text.posts[0]).not.toMatch(/@|https?:/)
    expect(text.posts[0]).toContain("Into the reef with")
    expect(text.hashtags).toEqual(["ocean", "coral", "wildlife"])
    expect(JSON.stringify(text)).not.toMatch(/280000000|someone|nasahubble/)
  })

  it("fails politely for private, missing, restricted and empty profiles", () => {
    expect(() => instagramText([{ ...INSTAGRAM_ITEM, private: true }])).toThrow(expect.objectContaining({ reason: "private" }))
    expect(() => instagramText([{ error: "not_found", errorDescription: "Profile does not exist" }])).toThrow(
      expect.objectContaining({ reason: "not_found" }),
    )
    expect(() => instagramText([])).toThrow(expect.objectContaining({ reason: "not_found" }))
    expect(() => instagramText([{ ...INSTAGRAM_ITEM, isRestrictedProfile: true }])).toThrow(expect.objectContaining({ reason: "blocked" }))
    expect(() => instagramText([{ username: "quiet", private: false, biography: "", latestPosts: [] }])).toThrow(
      expect.objectContaining({ reason: "empty" }),
    )
    expect(() => instagramText(["not an object"])).toThrow(ProfileReadError)
  })
})

describe("what is kept of a TikTok profile", () => {
  const author = { name: "climber", nickName: "Anna", signature: "Climbing and coffee ☕ @friend", fans: 1200, commerceUserInfo: { category: "Sports" } }

  it("keeps the bio, captions and hashtags, and leaves out sponsored videos", () => {
    const text = tiktokText([
      { text: "Bouldering in Berlin #climbing #boulder", hashtags: [{ name: "climbing" }, { name: "boulder" }], authorMeta: author },
      { text: "Morning espresso #coffee #climbing", hashtags: [{ name: "coffee" }, { name: "climbing" }], authorMeta: author },
      { text: "Buy this energy drink #ad", hashtags: [{ name: "ad" }], authorMeta: author, isAd: true },
    ])
    expect(text.bio).toBe("Climbing and coffee ☕")
    expect(text.category).toBe("Sports")
    expect(text.posts).toEqual(["Bouldering in Berlin #climbing #boulder", "Morning espresso #coffee #climbing"])
    expect(text.hashtags).toEqual(["climbing", "boulder", "coffee"])
    expect(JSON.stringify(text)).not.toMatch(/Anna|1200|energy drink/)
  })

  it("reads the actor's error items: private, missing and empty profiles", () => {
    const error = (errorCode: string) => [{ url: "https://www.tiktok.com/@x", input: "x", error: "x", errorCode }]
    expect(() => tiktokText(error("PROFILE_PRIVATE"))).toThrow(expect.objectContaining({ reason: "private" }))
    expect(() => tiktokText(error("NOT_FOUND"))).toThrow(expect.objectContaining({ reason: "not_found" }))
    expect(() => tiktokText(error("PROFILE_EMPTY"))).toThrow(expect.objectContaining({ reason: "empty" }))
    expect(() => tiktokText(error("PROFILE_VIDEOS_UNAVAILABLE"))).toThrow(expect.objectContaining({ reason: "empty" }))
    expect(() => tiktokText(error("SOMETHING_NEW"))).toThrow(expect.objectContaining({ reason: "failed" }))
    expect(() => tiktokText([])).toThrow(expect.objectContaining({ reason: "empty" }))
    expect(() => tiktokText([{ text: "hi", authorMeta: { privateAccount: true } }])).toThrow(expect.objectContaining({ reason: "private" }))
  })
})

describe("scrub", () => {
  it("takes out links, e-mail addresses, handles and phone numbers, and clips long text", () => {
    expect(scrub("Call +49 170 1234567 or mail me@anna.de, see https://anna.de @bestie", 200)).toBe("Call or mail , see")
    expect(scrub("a".repeat(50), 10)).toHaveLength(10)
    expect(scrub(null, 10)).toBe("")
  })
})
