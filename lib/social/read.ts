// One public profile or page, read once and turned into a few interests
// (issues #34 and #74). Instagram goes through Apify (APIFY_API_TOKEN) and,
// when Apify cannot read it, Bright Data (BRIGHTDATA_API_KEY); TikTok through
// Apify; LinkedIn through Bright Data; other public pages through Tavily
// Extract (TAVILY_API_KEY).
//
// The text that was read lives only inside this call: it goes to the model
// that names the interests and is then dropped. Only the interests are
// returned, and logs carry the source and the reason a read failed, never the
// handle, the address or anything that was read.
import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { ProfileReadError, readInstagramProfile, readTikTokProfile, type ProfileText, type ReadFailure } from "./apify"
import { readInstagramWithBrightData, readLinkedInProfile } from "./brightdata"
import { extractInterests } from "./interests"
import type { ProfileSource, ProfileTarget } from "./links"
import { readWebPage } from "./web"

export type ProfileReadResult = { ok: true; interests: string[] } | { ok: false; reason: ReadFailure }

// The longest one read may take, every route included, before the interest
// step. Apify answers in seconds and gives up at 70 s (REQUEST_TIMEOUT_MS in
// apify.ts); LinkedIn through Bright Data answers in seconds. The bound is
// longer than Apify's because Bright Data's Instagram scraper took about 95 s
// for one profile when measured on 22 November.
export const PROFILE_READ_TIMEOUT_MS = 120_000

// Bright Data's Instagram scraper is started as the second route only with at
// least this much of the read's time left, so it can finish. Apify's usual
// failures (out of credit, refused, rate limited, an outage) come back within
// a second or two and leave enough; after Apify's own 70 s timeout there is
// not enough left, and the read ends as a timeout.
export const BRIGHTDATA_INSTAGRAM_MIN_MS = 100_000

// Apify failures that say nothing about the profile itself, so another route may read it.
const SECOND_ROUTE_REASONS: ReadonlySet<ReadFailure> = new Set(["blocked", "failed", "timeout"])

function apifyToken(): string | undefined {
  return process.env.APIFY_API_TOKEN?.trim() || undefined
}

function brightDataKey(): string | undefined {
  return process.env.BRIGHTDATA_API_KEY?.trim() || undefined
}

function tavilyKey(): string | undefined {
  return process.env.TAVILY_API_KEY?.trim() || undefined
}

// Whether this kind of link can be read at all on this deployment.
export function canReadSource(source: ProfileSource): boolean {
  switch (source) {
    case "web":
      return Boolean(tavilyKey())
    case "linkedin":
      return Boolean(brightDataKey())
    case "instagram":
      return Boolean(apifyToken() || brightDataKey())
    case "tiktok":
      return Boolean(apifyToken())
  }
}

async function readInstagram(username: string, deadline: number): Promise<ProfileText> {
  const token = apifyToken()
  const key = brightDataKey()
  if (token) {
    try {
      return await readInstagramProfile(username, token, deadline)
    } catch (error) {
      const secondRoute =
        key && error instanceof ProfileReadError && SECOND_ROUTE_REASONS.has(error.reason) && deadline - Date.now() >= BRIGHTDATA_INSTAGRAM_MIN_MS
      if (!secondRoute) throw error
      console.warn("[social] Apify could not read the profile, trying Bright Data", {
        source: "instagram",
        reason: error.reason,
        ...(error.status ? { status: error.status } : {}),
      })
    }
  }
  if (!key) throw new ProfileReadError("blocked")
  return readInstagramWithBrightData(username, key, deadline)
}

async function readText(target: ProfileTarget, deadline: number): Promise<ProfileText> {
  switch (target.source) {
    case "web": {
      const key = tavilyKey()
      if (!key) throw new ProfileReadError("blocked")
      return readWebPage(target.url, key)
    }
    case "linkedin": {
      const key = brightDataKey()
      if (!key) throw new ProfileReadError("blocked")
      return readLinkedInProfile(target.username, key, deadline)
    }
    case "instagram":
      return readInstagram(target.username, deadline)
    case "tiktok": {
      const token = apifyToken()
      if (!token) throw new ProfileReadError("blocked")
      return readTikTokProfile(target.username, token, deadline)
    }
  }
}

export async function readProfileInterests(target: ProfileTarget, language: string): Promise<ProfileReadResult> {
  try {
    const text = await readText(target, Date.now() + PROFILE_READ_TIMEOUT_MS)
    const interests = await extractInterests(text, language)
    if (interests.length === 0) return { ok: false, reason: "empty" }
    return { ok: true, interests }
  } catch (error) {
    if (error instanceof ProfileReadError) {
      console.warn("[social] profile read failed", { source: target.source, reason: error.reason, ...(error.status ? { status: error.status } : {}) })
      return { ok: false, reason: error.reason }
    }
    // The interest step failed: an API error, a refusal or output that did not parse.
    const status = error instanceof Anthropic.APIError ? error.status : undefined
    console.warn("[social] interest step failed", { source: target.source, name: error instanceof Error ? error.name : "unknown", ...(status ? { status } : {}) })
    return { ok: false, reason: "failed" }
  }
}
