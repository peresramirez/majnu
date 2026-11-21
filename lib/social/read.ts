// One public profile or page, read once and turned into a few interests
// (issue #34). Instagram and TikTok go through Apify (APIFY_API_TOKEN), other
// public pages through Tavily Extract (TAVILY_API_KEY).
//
// The text that was read lives only inside this call: it goes to the model
// that names the interests and is then dropped. Only the interests are
// returned, and logs carry the source and the reason a read failed, never the
// handle, the address or anything that was read.
import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import { ProfileReadError, readInstagramProfile, readTikTokProfile, type ProfileText, type ReadFailure } from "./apify"
import { extractInterests } from "./interests"
import type { ProfileSource, ProfileTarget } from "./links"
import { readWebPage } from "./web"

export type ProfileReadResult = { ok: true; interests: string[] } | { ok: false; reason: ReadFailure }

function apifyToken(): string | undefined {
  return process.env.APIFY_API_TOKEN?.trim() || undefined
}

function tavilyKey(): string | undefined {
  return process.env.TAVILY_API_KEY?.trim() || undefined
}

// Whether this kind of link can be read at all on this deployment.
export function canReadSource(source: ProfileSource): boolean {
  return source === "web" ? Boolean(tavilyKey()) : Boolean(apifyToken())
}

async function readText(target: ProfileTarget): Promise<ProfileText> {
  if (target.source === "web") {
    const key = tavilyKey()
    if (!key) throw new ProfileReadError("blocked")
    return readWebPage(target.url, key)
  }
  const token = apifyToken()
  if (!token) throw new ProfileReadError("blocked")
  return target.source === "instagram" ? readInstagramProfile(target.username, token) : readTikTokProfile(target.username, token)
}

export async function readProfileInterests(target: ProfileTarget, language: string): Promise<ProfileReadResult> {
  try {
    const text = await readText(target)
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
