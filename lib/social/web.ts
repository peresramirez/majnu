// Reading another public page about the person (a personal site, a blog's
// about page) with Tavily Extract
// (https://docs.tavily.com/documentation/api-reference/endpoint/extract), only
// when the sender pasted it into the gift finder. Issue #34.
//
// Basic depth costs 1 Tavily credit per 5 pages. `query` makes Tavily return
// the parts of the page about what the person likes rather than the whole
// page, which also keeps the text short. The text is kept in memory for the
// one model call that turns it into interests, and never stored or logged.
import "server-only"
import * as z from "zod/v4"
import { ProfileReadError, scrub, type ProfileText } from "./apify"

export const TAVILY_EXTRACT_URL = "https://api.tavily.com/extract"
// Tavily's own extraction timeout, in seconds (1 to 60); the request gives up a little later.
const EXTRACT_TIMEOUT_SECS = 15
const REQUEST_TIMEOUT_MS = 20_000
const MAX_PAGE_TEXT = 4000
const QUERY = "what this person loves: hobbies, interests, passions, favourite things, what they do in their free time"

const ExtractResponse = z.object({
  results: z.array(z.object({ url: z.string().nullish(), raw_content: z.string().nullish() })).catch([]),
  failed_results: z.array(z.unknown()).nullish().catch(null),
})

export async function readWebPage(url: string, apiKey: string): Promise<ProfileText> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetch(TAVILY_EXTRACT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          urls: [url],
          query: QUERY,
          chunks_per_source: 3,
          extract_depth: "basic",
          format: "text",
          include_images: false,
          include_favicon: false,
          timeout: EXTRACT_TIMEOUT_SECS,
        }),
        signal: controller.signal,
      })
    } catch {
      throw new ProfileReadError(controller.signal.aborted ? "timeout" : "failed")
    }
    // 401 bad key, 429 rate limit, 432 and 433 plan or spending limits, 5xx outage.
    if (!response.ok) throw new ProfileReadError(response.status === 429 || response.status === 432 || response.status === 433 ? "blocked" : "failed", response.status)
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new ProfileReadError(controller.signal.aborted ? "timeout" : "failed", response.status)
    }
    const parsed = ExtractResponse.safeParse(body)
    if (!parsed.success) throw new ProfileReadError("failed", response.status)
    const page = parsed.data.results.map((result) => result.raw_content ?? "").join(" ")
    // A page Tavily could not open (missing, blocked, behind a login) is in failed_results.
    if (!page.trim()) throw new ProfileReadError(parsed.data.failed_results?.length ? "not_found" : "empty")
    const text = scrub(page.replace(/\[\.\.\.\]/g, " "), MAX_PAGE_TEXT)
    if (!text) throw new ProfileReadError("empty")
    return { posts: [text], hashtags: [] }
  } finally {
    clearTimeout(timer)
  }
}
