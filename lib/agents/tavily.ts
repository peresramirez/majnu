// Tavily web search for the research sub-agent, used when TAVILY_API_KEY is set.
// One POST to the Search API (https://docs.tavily.com/documentation/api-reference/endpoint/search)
// with a timeout. Results are cut down before they reach the model, to save
// tokens and Worker CPU.
//
// For the gift finder a search can also be pointed at the visitor's country and
// language, and ask for images: with include_images, Tavily returns an `images`
// list inside each result, taken from that page. We keep the first usable one
// per result, so a product's photo comes with the search that found it and no
// page is fetched one by one.
import "server-only"
import * as z from "zod/v4"
import { httpsOnly } from "./safe-url"

export const TAVILY_SEARCH_URL = "https://api.tavily.com/search"
export const SEARCH_TIMEOUT_MS = 8000
export const MAX_RESULTS = 5
const MAX_QUERY = 400
const MAX_TITLE = 120
const MAX_EXTRACT = 500
const MAX_IMAGE_URL = 2048

export type SearchResult = { title: string; url: string; extract: string; imageUrl?: string }

export type SearchOptions = {
  // ISO 3166-1 alpha-2, e.g. "DE". Sent only when Tavily knows the country.
  country?: string
  // ISO 639-1, e.g. "de". Tavily ranks results in that language higher.
  language?: string
  // Ask for the images on each result page.
  images?: boolean
}

export class TavilySearchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "TavilySearchError"
  }
}

// Only the fields we use; Tavily sends more (score, raw_content, ...). Images
// are read leniently: a shape we do not expect costs the image, not the search.
const SearchResponse = z.object({
  results: z.array(
    z.object({
      title: z.string().nullish(),
      url: z.string(),
      content: z.string().nullish(),
      images: z.unknown().optional(),
    }),
  ),
})

// The countries Tavily's `country` parameter accepts, as it spells them. A
// value outside this list is rejected with a 400, so it is never sent.
const TAVILY_COUNTRIES = new Set(
  (
    "afghanistan|albania|algeria|andorra|angola|argentina|armenia|australia|austria|azerbaijan|bahamas|bahrain|bangladesh|" +
    "barbados|belarus|belgium|belize|benin|bhutan|bolivia|bosnia and herzegovina|botswana|brazil|brunei|bulgaria|burkina faso|" +
    "burundi|cambodia|cameroon|canada|cape verde|central african republic|chad|chile|china|colombia|comoros|congo|costa rica|" +
    "croatia|cuba|cyprus|czech republic|denmark|djibouti|dominican republic|ecuador|egypt|el salvador|equatorial guinea|eritrea|" +
    "estonia|ethiopia|fiji|finland|france|gabon|gambia|georgia|germany|ghana|greece|guatemala|guinea|haiti|honduras|hungary|" +
    "iceland|india|indonesia|iran|iraq|ireland|israel|italy|jamaica|japan|jordan|kazakhstan|kenya|kuwait|kyrgyzstan|latvia|" +
    "lebanon|lesotho|liberia|libya|liechtenstein|lithuania|luxembourg|madagascar|malawi|malaysia|maldives|mali|malta|mauritania|" +
    "mauritius|mexico|moldova|monaco|mongolia|montenegro|morocco|mozambique|myanmar|namibia|nepal|netherlands|new zealand|" +
    "nicaragua|niger|nigeria|north korea|north macedonia|norway|oman|pakistan|panama|papua new guinea|paraguay|peru|philippines|" +
    "poland|portugal|qatar|romania|russia|rwanda|saudi arabia|senegal|serbia|singapore|slovakia|slovenia|somalia|south africa|" +
    "south korea|south sudan|spain|sri lanka|sudan|sweden|switzerland|syria|taiwan|tajikistan|tanzania|thailand|togo|" +
    "trinidad and tobago|tunisia|turkey|turkmenistan|uganda|ukraine|united arab emirates|united kingdom|united states|uruguay|" +
    "uzbekistan|venezuela|vietnam|yemen|zambia|zimbabwe"
  ).split("|"),
)

// Where the runtime's English region name differs from Tavily's spelling.
const TAVILY_COUNTRY_OVERRIDES: Record<string, string> = {
  BA: "bosnia and herzegovina",
  CD: "congo",
  CG: "congo",
  CV: "cape verde",
  CZ: "czech republic",
  GB: "united kingdom",
  KP: "north korea",
  KR: "south korea",
  MK: "north macedonia",
  MM: "myanmar",
  TR: "turkey",
  TT: "trinidad and tobago",
  US: "united states",
}

// "DE" -> "germany"; undefined when Tavily does not list the country.
export function tavilyCountry(code: string | undefined): string | undefined {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return undefined
  const upper = code.toUpperCase()
  let name: string | undefined = TAVILY_COUNTRY_OVERRIDES[upper]
  if (!name) {
    try {
      name = new Intl.DisplayNames(["en"], { type: "region" }).of(upper)?.toLowerCase().replace(/&/g, "and")
    } catch {
      return undefined
    }
  }
  return name && TAVILY_COUNTRIES.has(name) ? name : undefined
}

function clip(text: string | null | undefined, max: number): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

// Logos and icons are not product photos. Matched as whole words in the path,
// so "silicone-mould.jpg" is still a photo.
const NOT_A_PHOTO = /(^|[/_.-])(logos?|icons?|favicon|sprites?|placeholder|avatar)([/_.-]|$)/i

// The first https image of a result that looks like a photo, or undefined.
export function firstImage(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined
  for (const image of images) {
    const raw = typeof image === "string" ? image : image && typeof image === "object" ? (image as { url?: unknown }).url : undefined
    if (typeof raw !== "string" || raw.length > MAX_IMAGE_URL) continue
    const url = httpsOnly(raw.trim())
    if (!url) continue
    const path = new URL(url).pathname
    if (/\.svg$/i.test(path) || NOT_A_PHOTO.test(path)) continue
    return url
  }
  return undefined
}

function language(code: string | undefined): string | undefined {
  return code && /^[a-z]{2,3}$/i.test(code) ? code.toLowerCase() : undefined
}

export async function searchTavily(query: string, apiKey: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const country = tavilyCountry(options.country)
  const lang = language(options.language)
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
          include_images: options.images === true,
          // `country` only works with the general topic, which is also the default.
          ...(country ? { topic: "general", country } : {}),
          // Ranks results in this language higher; it does not filter the others out.
          ...(lang ? { language: lang } : {}),
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

    return parsed.data.results.slice(0, MAX_RESULTS).map((result) => {
      const imageUrl = options.images ? firstImage(result.images) : undefined
      return {
        title: clip(result.title, MAX_TITLE),
        url: result.url,
        extract: clip(result.content, MAX_EXTRACT),
        ...(imageUrl ? { imageUrl } : {}),
      }
    })
  } finally {
    clearTimeout(timer)
  }
}
