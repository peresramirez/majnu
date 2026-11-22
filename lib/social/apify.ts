// Reading a public Instagram or TikTok profile with Apify (issue #34), only
// when the sender pasted it into the gift finder.
//
// One call to "Run Actor synchronously and get dataset items"
// (https://docs.apify.com/api/v2/act-run-sync-get-dataset-items-post) per read,
// with the official profile scrapers and their documented inputs (checked
// against each actor's input schema on 21 November):
// - apify/instagram-profile-scraper: { usernames: [name] }, one item per
//   profile, $0.0026 a profile;
// - clockworks/tiktok-profile-scraper: { profiles: [name], resultsPerPage },
//   one item per video with the author on each, $0.003 a video. It pushes an
//   item with `errorCode` (PROFILE_PRIVATE, NOT_FOUND, PROFILE_EMPTY...) when it
//   cannot read a profile.
//
// The token goes in the Authorization header, never in the URL. `fields` asks
// Apify for the few fields we read, so follower lists, related profiles and
// contact details never reach us at all. What comes back is cut down to the
// bio, the category and recent captions and hashtags, kept in memory for the
// one model call that turns them into interests, and never stored or logged.
import "server-only"
import * as z from "zod/v4"

export const APIFY_API = "https://api.apify.com/v2"
export const APIFY_ACTORS = {
  instagram: "apify~instagram-profile-scraper",
  tiktok: "clockworks~tiktok-profile-scraper",
} as const

// The actor's own run timeout; the request itself gives up a little later.
export const RUN_TIMEOUT_SECS = 60
export const REQUEST_TIMEOUT_MS = 70_000
// TikTok charges per video, so a handful is enough to see what someone posts about.
export const TIKTOK_VIDEOS = 10
// The most one run may cost, whatever the actor's pricing does: a guard on
// the $5 of Apify credit on top of APIFY_DAILY_CAP.
export const MAX_CHARGE_USD = 0.05

// Shared with lib/social/brightdata.ts, so every source is cut down the same way.
export const MAX_POSTS = 12
export const MAX_BIO = 500
export const MAX_CAPTION = 300
const MAX_HASHTAGS = 30

// What a profile says about its owner, ready for the interest step.
export type ProfileText = {
  // A LinkedIn headline ("Product designer, trail runner").
  headline?: string
  bio?: string
  category?: string
  // LinkedIn: roles, companies and schools, one per line.
  background?: string[]
  posts: string[]
  hashtags: string[]
}

export type ReadFailure = "private" | "not_found" | "empty" | "blocked" | "timeout" | "failed"

export class ProfileReadError extends Error {
  constructor(readonly reason: ReadFailure, readonly status?: number) {
    super(`The profile could not be read: ${reason}${status ? ` (HTTP ${status})` : ""}`)
    this.name = "ProfileReadError"
  }
}

const INSTAGRAM_FIELDS = "username,private,biography,businessCategoryName,latestPosts,isRestrictedProfile,error,errorDescription"
const TIKTOK_FIELDS = "text,hashtags,authorMeta,isAd,error,errorCode"

// Read leniently: an unexpected shape costs a field, not the read.
const InstagramItem = z.object({
  private: z.boolean().nullish().catch(null),
  biography: z.string().nullish().catch(null),
  businessCategoryName: z.string().nullish().catch(null),
  latestPosts: z
    .array(z.object({ caption: z.string().nullish().catch(null), hashtags: z.array(z.string()).nullish().catch(null) }).passthrough())
    .nullish()
    .catch(null),
  isRestrictedProfile: z.boolean().nullish().catch(null),
  error: z.string().nullish().catch(null),
  errorDescription: z.string().nullish().catch(null),
})

const TikTokItem = z.object({
  text: z.string().nullish().catch(null),
  hashtags: z.array(z.object({ name: z.string().nullish().catch(null) }).passthrough()).nullish().catch(null),
  authorMeta: z
    .object({
      signature: z.string().nullish().catch(null),
      privateAccount: z.boolean().nullish().catch(null),
      commerceUserInfo: z.object({ category: z.string().nullish().catch(null) }).passthrough().nullish().catch(null),
    })
    .passthrough()
    .nullish()
    .catch(null),
  isAd: z.boolean().nullish().catch(null),
  error: z.string().nullish().catch(null),
  errorCode: z.string().nullish().catch(null),
})

// Links, e-mail addresses and @handles of other people are taken out before
// anything reaches the model: the interests must not name anyone.
export function scrub(text: string | null | undefined, max: number): string {
  const clean = (text ?? "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g, " ")
    .replace(/(^|[^\w])@[\w.]+/g, "$1")
    .replace(/\+?\d[\d ()/-]{7,}\d/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean
}

export function hashtag(tag: string | null | undefined): string | undefined {
  const name = tag?.replace(/^#/, "").trim()
  return name && /^[\p{L}\p{N}_]{2,40}$/u.test(name) ? name.toLowerCase() : undefined
}

// The most used hashtags first.
export function topHashtags(tags: (string | undefined)[]): string[] {
  const counts = new Map<string, number>()
  for (const tag of tags) if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_HASHTAGS).map(([tag]) => tag)
}

export function hasContent(text: ProfileText): boolean {
  return Boolean(text.headline || text.bio || text.category || text.background?.length || text.posts.length || text.hashtags.length)
}

export function instagramText(items: unknown[]): ProfileText {
  const first = InstagramItem.safeParse(items[0])
  if (!first.success) throw new ProfileReadError(items.length === 0 ? "not_found" : "failed")
  const item = first.data
  if (item.error) throw new ProfileReadError("not_found")
  if (item.private) throw new ProfileReadError("private")
  if (item.isRestrictedProfile) throw new ProfileReadError("blocked")
  const posts = (item.latestPosts ?? []).slice(0, MAX_POSTS)
  const bio = scrub(item.biography, MAX_BIO)
  const category = scrub(item.businessCategoryName, 60)
  const text: ProfileText = {
    ...(bio ? { bio } : {}),
    ...(category ? { category } : {}),
    posts: posts.map((post) => scrub(post.caption, MAX_CAPTION)).filter(Boolean),
    hashtags: topHashtags(posts.flatMap((post) => (post.hashtags ?? []).map(hashtag))),
  }
  if (!hasContent(text)) throw new ProfileReadError("empty")
  return text
}

const TIKTOK_PRIVATE = new Set(["PROFILE_PRIVATE"])
const TIKTOK_MISSING = new Set(["NOT_FOUND"])
const TIKTOK_EMPTY = new Set(["PROFILE_EMPTY", "PROFILE_VIDEOS_UNAVAILABLE"])

export function tiktokText(items: unknown[]): ProfileText {
  const parsed = items.map((item) => TikTokItem.safeParse(item)).filter((r) => r.success).map((r) => r.data)
  if (parsed.length === 0) throw new ProfileReadError(items.length === 0 ? "empty" : "failed")
  const failure = parsed.find((item) => item.errorCode || item.error)
  const videos = parsed.filter((item) => !item.errorCode && !item.error)
  if (videos.length === 0) {
    const code = failure?.errorCode ?? ""
    if (TIKTOK_PRIVATE.has(code)) throw new ProfileReadError("private")
    if (TIKTOK_MISSING.has(code)) throw new ProfileReadError("not_found")
    if (TIKTOK_EMPTY.has(code)) throw new ProfileReadError("empty")
    throw new ProfileReadError("failed")
  }
  const author = videos.find((item) => item.authorMeta)?.authorMeta
  if (author?.privateAccount) throw new ProfileReadError("private")
  // Sponsored videos say more about the advertiser than the person.
  const own = videos.filter((item) => !item.isAd).slice(0, MAX_POSTS)
  const bio = scrub(author?.signature, MAX_BIO)
  const category = scrub(author?.commerceUserInfo?.category, 60)
  const text: ProfileText = {
    ...(bio ? { bio } : {}),
    ...(category ? { category } : {}),
    posts: own.map((item) => scrub(item.text, MAX_CAPTION)).filter(Boolean),
    hashtags: topHashtags(own.flatMap((item) => (item.hashtags ?? []).map((tag) => hashtag(tag.name)))),
  }
  if (!hasContent(text)) throw new ProfileReadError("empty")
  return text
}

function failureFor(status: number): ReadFailure {
  if (status === 408) return "timeout"
  // 402: out of credit. 403: the actor or the token is not allowed. 429: rate limited.
  if (status === 402 || status === 403 || status === 429) return "blocked"
  return "failed"
}

// `deadline` (epoch ms) is the end of the whole profile read (lib/social/read.ts):
// the request gives up at REQUEST_TIMEOUT_MS or then, whichever comes first.
async function runActor(actor: string, input: Record<string, unknown>, fields: string, token: string, deadline?: number): Promise<unknown[]> {
  const params = new URLSearchParams({
    timeout: String(RUN_TIMEOUT_SECS),
    maxTotalChargeUsd: String(MAX_CHARGE_USD),
    format: "json",
    clean: "true",
    fields,
  })
  const timeout = deadline === undefined ? REQUEST_TIMEOUT_MS : Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now())
  if (timeout <= 0) throw new ProfileReadError("timeout")
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    let response: Response
    try {
      response = await fetch(`${APIFY_API}/acts/${actor}/run-sync-get-dataset-items?${params}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
        signal: controller.signal,
      })
    } catch {
      throw new ProfileReadError(controller.signal.aborted ? "timeout" : "failed")
    }
    if (!response.ok) throw new ProfileReadError(failureFor(response.status), response.status)
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ProfileReadError(controller.signal.aborted ? "timeout" : "failed", response.status)
    }
    if (!Array.isArray(body)) throw new ProfileReadError("failed", response.status)
    return body
  } finally {
    clearTimeout(timer)
  }
}

export async function readInstagramProfile(username: string, token: string, deadline?: number): Promise<ProfileText> {
  const items = await runActor(APIFY_ACTORS.instagram, { usernames: [username] }, INSTAGRAM_FIELDS, token, deadline)
  return instagramText(items)
}

export async function readTikTokProfile(username: string, token: string, deadline?: number): Promise<ProfileText> {
  const items = await runActor(
    APIFY_ACTORS.tiktok,
    {
      profiles: [username],
      profileScrapeSections: ["videos"],
      profileSorting: "latest",
      resultsPerPage: TIKTOK_VIDEOS,
      excludePinnedPosts: false,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSlideshowImages: false,
      shouldDownloadAvatars: false,
      downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
      maxFollowersPerProfile: 0,
      maxFollowingPerProfile: 0,
      commentsPerPost: 0,
    },
    TIKTOK_FIELDS,
    token,
    deadline,
  )
  return tiktokText(items)
}
