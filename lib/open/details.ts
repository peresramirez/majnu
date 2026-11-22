// What POST /api/open records about an open besides the time (issue #49, the
// Tracker tab): the approximate place, the browser's language and the kind of
// device. Pure functions plus one read of Cloudflare's request data, so each
// rule can be unit-tested.
//
// Privacy (docs/features/sharing-and-tracking.md, "Data and privacy"):
// - Place is the country and city Cloudflare derives from the network. The IP
//   address, region code, postal code, coordinates and timezone in the same
//   data are never read here.
// - Language is the primary subtag of Accept-Language ("de"), not the list.
// - Device is "phone", "tablet" or "desktop", derived from the user agent; the
//   owner never sees the user agent itself.
// If what is recorded changes, change /privacy in the same commit.
import { getCloudflareContext } from "@opennextjs/cloudflare"

export type DeviceType = "phone" | "tablet" | "desktop"

export type OpenDetails = {
  country: string | null
  city: string | null
  language: string | null
  device: DeviceType | null
}

export const NO_DETAILS: OpenDetails = { country: null, city: null, language: null, device: null }

// ---------- Place ----------

const COUNTRY = /^[A-Z]{2}$/
// Cloudflare's codes for "unknown" (XX) and the Tor network (T1).
const NOT_A_COUNTRY = new Set(["XX", "T1"])
// Matches the check on letter_events.city (0009_open_details.sql).
const MAX_CITY = 80

export function cleanCountry(value: unknown): string | null {
  if (typeof value !== "string") return null
  const code = value.trim().toUpperCase()
  return COUNTRY.test(code) && !NOT_A_COUNTRY.has(code) ? code : null
}

// One line of at most 80 characters, with control characters and runs of
// whitespace folded into single spaces.
export function cleanCity(value: unknown): string | null {
  if (typeof value !== "string") return null
  const city = value
    .normalize("NFC")
    .replace(/[\p{Cc}\s]+/gu, " ")
    .trim()
  return city && city.length <= MAX_CITY ? city : null
}

type CfData = Record<string, unknown> | undefined

// Cloudflare's request data (request.cf) for the current request. OpenNext
// keeps it per request in getCloudflareContext(); outside Workers (`next dev`,
// tests) that call throws and there is none.
export function requestCf(): CfData {
  try {
    return getCloudflareContext<Record<string, unknown>>().cf
  } catch {
    return undefined
  }
}

// Country and city from request.cf; failing that, the country alone from the
// CF-IPCountry header Cloudflare adds; failing that, nothing (local dev).
export function openLocation(cf: CfData, headers: Headers): Pick<OpenDetails, "country" | "city"> {
  const country = cleanCountry(cf?.country)
  if (country) return { country, city: cleanCity(cf?.city) }
  return { country: cleanCountry(headers.get("cf-ipcountry")), city: null }
}

// ---------- Language ----------

const LANGUAGE = /^[a-z]{2,3}$/
const QVALUE = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/
const MAX_LANGUAGE_RANGES = 32

// The primary subtag of the most preferred language in an Accept-Language
// header: "de-DE,de;q=0.9,en;q=0.8" -> "de". Ranges are weighed by q (missing
// means 1, 0 means "not wanted"); ties go to the earlier range. "*", private
// tags and anything malformed are skipped. Null when nothing usable is left.
export function primaryLanguage(header: string | null | undefined): string | null {
  if (!header) return null
  let best: string | null = null
  let bestQ = 0
  for (const range of header.split(",").slice(0, MAX_LANGUAGE_RANGES)) {
    const [tagPart, ...params] = range.split(";")
    const tag = tagPart.trim()
    if (!tag || tag === "*") continue
    let q = 1
    for (const param of params) {
      const [name, value = ""] = param.split("=")
      if (name.trim().toLowerCase() !== "q") continue
      // RFC 9110 qvalue: 0 to 1 with at most three decimals. Anything else drops the range.
      q = QVALUE.test(value.trim()) ? Number(value) : Number.NaN
    }
    if (!Number.isFinite(q) || q <= 0 || q > 1) continue
    const primary = tag.split("-")[0].toLowerCase()
    if (!LANGUAGE.test(primary)) continue
    if (q > bestQ) {
      best = primary
      bestQ = q
    }
  }
  return best
}

// ---------- Device ----------

// Tablets first: Android tablets drop "Mobile" from the user agent, phones keep
// it. iPads on iPadOS 13 and later present themselves as a Mac, so they count
// as desktops; the server cannot tell them apart.
const TABLET = /\biPad\b|\bTablet\b|PlayBook|\bSilk\b|Kindle|\bKF[A-Z]{2,4}\b/i
const PHONE = /\bMobi|iPhone|iPod|Windows Phone|BlackBerry|\bBB10\b|Opera Mini|IEMobile|KAIOS/i

export function deviceType(userAgent: string | null | undefined): DeviceType | null {
  const ua = userAgent?.trim()
  if (!ua) return null
  if (TABLET.test(ua)) return "tablet"
  if (/\bAndroid\b/i.test(ua)) return /\bMobile\b/i.test(ua) ? "phone" : "tablet"
  if (PHONE.test(ua)) return "phone"
  return "desktop"
}

// ---------- Crawlers ----------

// Link-preview services, search engines, headless browsers and HTTP libraries.
// Most of them never run the page's beacon, which is the first line of
// defence; this catches the ones that do, or that post to /api/open directly.
// In-app browsers of chat apps (Instagram, Facebook's FBAN, Telegram-Android)
// are real people and are not listed; only their preview bots are.
const KNOWN_CRAWLERS =
  /facebookexternalhit|facebookcatalog|meta-externalagent|\bFacebot\b|Twitterbot|LinkedInBot|Slackbot|Slack-ImgProxy|Discordbot|TelegramBot|WhatsApp\/|SkypeUriPreview|Pinterest(?:bot)?\/|redditbot|Embedly|Iframely|vkShare|bitlybot|Google-InspectionTool|GoogleOther|Google-PageRenderer|Google-Read-Aloud|APIs-Google|AdsBot-Google|Mediapartners-Google|FeedFetcher-Google|Applebot|bingbot|BingPreview|DuckDuckBot|YandexBot|Baiduspider|Bytespider|PetalBot|GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|PerplexityBot|Amazonbot|CCBot|HeadlessChrome|Chrome-Lighthouse|PageSpeed|Pingdom|UptimeRobot|\bcurl\/|\bWget\/|python-requests|python-urllib|aiohttp|\bhttpx\b|Go-http-client|okhttp|\bJava\/|axios\/|node-fetch|undici|PostmanRuntime/i
// "Somebot/2.1", "(compatible; Somebot; +http...)", "...crawler", "...spider".
const GENERIC_CRAWLER = /bot[/;]|crawler|spider/i

export function isCrawler(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false
  return KNOWN_CRAWLERS.test(userAgent) || GENERIC_CRAWLER.test(userAgent)
}

// ---------- All of it, for one request ----------

export function openDetails(request: Request, cf: CfData = requestCf()): OpenDetails {
  return {
    ...openLocation(cf, request.headers),
    language: primaryLanguage(request.headers.get("accept-language")),
    device: deviceType(request.headers.get("user-agent")),
  }
}
