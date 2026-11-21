// Tavily web search for the research sub-agent, used when TAVILY_API_KEY is set.
// One POST to the Search API (https://docs.tavily.com/documentation/api-reference/endpoint/search)
// with a timeout. Results are cut down before they reach the model, to save
// tokens and Worker CPU.
import "server-only"
import * as z from "zod/v4"

export const TAVILY_SEARCH_URL = "https://api.tavily.com/search"
export const SEARCH_TIMEOUT_MS = 8000
export const MAX_RESULTS = 5
const MAX_QUERY = 400
const MAX_TITLE = 120
const MAX_EXTRACT = 500

export type SearchResult = { title: string; url: string; extract: string }

export class TavilySearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TavilySearchError"
  }
}

// Only the fields we use; Tavily sends more (score, raw_content, images, ...).
const SearchResponse = z.object({
  results: z.array(
    z.object({
      title: z.string().nullish(),
      url: z.string(),
      content: z.string().nullish(),
    }),
  ),
})

function clip(text: string | null | undefined, max: number): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS)
  try {
    let response: Response
    try {
      response = await fetch(TAVILY_SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          query: query.trim().slice(0, MAX_QUERY),
          search_depth: "basic",
          max_results: MAX_RESULTS,
          // One snippet of about 500 characters per result is enough to judge a shop page.
          chunks_per_source: 1,
          include_answer: false,
          include_raw_content: false,
          include_images: false,
        }),
        signal: controller.signal,
      })
    } catch {
      throw new TavilySearchError(controller.signal.aborted ? "timed out" : "could not be reached")
    }
    // 401 bad key, 429 rate limit, 432 and 433 plan or spending limits, 5xx outage.
    if (!response.ok) throw new TavilySearchError(`failed with HTTP ${response.status}`)

    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new TavilySearchError(controller.signal.aborted ? "timed out" : "returned a body that is not JSON")
    }
    const parsed = SearchResponse.safeParse(body)
    if (!parsed.success) throw new TavilySearchError("returned an unexpected response")

    return parsed.data.results.slice(0, MAX_RESULTS).map((result) => ({
      title: clip(result.title, MAX_TITLE),
      url: result.url,
      extract: clip(result.content, MAX_EXTRACT),
    }))
  } finally {
    clearTimeout(timer)
  }
}
