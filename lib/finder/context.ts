// What the gift finder knows before it asks anything (docs/plan.md, "Gift
// finder", step 2): where the visitor is, from the network, and their language
// and timezone, from the browser.
//
// Privacy: only the country and the first-level region (a state such as
// "Berlin" or "Texas") are read. Cloudflare's request data also has the city,
// postal code and coordinates, and the request has an IP address; none of them
// is read, stored or logged here.
import "server-only"
import { getCloudflareContext } from "@opennextjs/cloudflare"
import { resolveTimezone } from "@/lib/agents/context"
import type { FinderContext, FinderLocale } from "./events"

export type RequestLocation = { country?: string; region?: string }

// The part of the context that does not depend on what the visitor typed.
export type BaseContext = Pick<FinderContext, "country" | "region" | "language" | "currency">

const COUNTRY = /^[A-Z]{2}$/
// Cloudflare's codes for "unknown" (XX) and the Tor network (T1).
const NOT_A_COUNTRY = new Set(["XX", "T1"])
const MAX_REGION = 80

function cleanCountry(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const code = value.trim().toUpperCase()
  return COUNTRY.test(code) && !NOT_A_COUNTRY.has(code) ? code : undefined
}

function cleanRegion(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const region = value.replace(/\s+/g, " ").trim()
  return region && region.length <= MAX_REGION ? region : undefined
}

// Country and region from Cloudflare's request data, or just the country from
// the cf-ipcountry header Cloudflare adds. In `next dev` there is neither, and
// the finder works without a location.
export function requestLocation(request: Request): RequestLocation {
  let cf: Record<string, unknown> | undefined
  try {
    cf = getCloudflareContext<Record<string, unknown>>().cf
  } catch {
    // Not running on Workers.
  }
  const country = cleanCountry(cf?.country) ?? cleanCountry(request.headers.get("cf-ipcountry"))
  if (!country) return {}
  const region = cleanCountry(cf?.country) ? cleanRegion(cf?.region) : undefined
  return region ? { country, region } : { country }
}

// ---------- Language ----------

export const DEFAULT_LANGUAGE = "en"

// "de-DE" -> "de". Anything that is not a language tag falls back to English.
export function baseLanguage(tag: string | undefined | null): string | undefined {
  if (!tag || tag.length > 35) return undefined
  try {
    const language = new Intl.Locale(tag.trim()).language.toLowerCase()
    return /^[a-z]{2,3}$/.test(language) ? language : undefined
  } catch {
    return undefined
  }
}

// The browser's tag in canonical form ("de-DE"), or undefined. It goes into the
// model's context block, so nothing but a real language tag gets through.
export function canonicalLocale(tag: string | undefined | null): string | undefined {
  if (!tag || tag.length > 35) return undefined
  try {
    return Intl.getCanonicalLocales(tag.trim())[0]
  } catch {
    return undefined
  }
}

export function localeLanguage(locale: FinderLocale | undefined): string {
  return baseLanguage(locale?.language) ?? baseLanguage(locale?.languages?.[0]) ?? DEFAULT_LANGUAGE
}

// ---------- Currency ----------

const EURO = "AD AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MC ME MT NL PT SI SK SM VA XK"
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  ...Object.fromEntries(EURO.split(" ").map((code) => [code, "EUR"])),
  AE: "AED", AL: "ALL", AM: "AMD", AR: "ARS", AU: "AUD", AZ: "AZN", BA: "BAM", BD: "BDT", BH: "BHD", BR: "BRL",
  BY: "BYN", CA: "CAD", CH: "CHF", CL: "CLP", CN: "CNY", CO: "COP", CR: "CRC", CZ: "CZK", DK: "DKK", DO: "DOP",
  DZ: "DZD", EG: "EGP", GB: "GBP", GE: "GEL", GH: "GHS", GT: "GTQ", HK: "HKD", HU: "HUF", ID: "IDR", IL: "ILS",
  IN: "INR", IS: "ISK", JO: "JOD", JP: "JPY", KE: "KES", KR: "KRW", KW: "KWD", KZ: "KZT", LB: "LBP", LI: "CHF",
  LK: "LKR", MA: "MAD", MD: "MDL", MK: "MKD", MX: "MXN", MY: "MYR", NG: "NGN", NO: "NOK", NZ: "NZD", OM: "OMR",
  PE: "PEN", PH: "PHP", PK: "PKR", PL: "PLN", QA: "QAR", RO: "RON", RS: "RSD", RU: "RUB", SA: "SAR", SE: "SEK",
  SG: "SGD", TH: "THB", TN: "TND", TR: "TRY", TW: "TWD", UA: "UAH", US: "USD", UY: "UYU", VN: "VND", ZA: "ZAR",
}

export function currencyFor(country: string | undefined): string | undefined {
  return country ? CURRENCY_BY_COUNTRY[country.toUpperCase()] : undefined
}

export function baseContext(location: RequestLocation, locale: FinderLocale | undefined): BaseContext {
  const currency = currencyFor(location.country)
  return {
    ...(location.country ? { country: location.country } : {}),
    ...(location.region ? { region: location.region } : {}),
    language: localeLanguage(locale),
    ...(currency ? { currency } : {}),
  }
}

export function localeTimezone(locale: FinderLocale | undefined): string {
  return resolveTimezone(locale?.timezone)
}

// "Berlin, Germany" for the researcher; undefined without a country.
export function placeName(context: Pick<FinderContext, "country" | "region">): string | undefined {
  if (!context.country) return undefined
  let country = context.country
  try {
    country = new Intl.DisplayNames(["en"], { type: "region" }).of(context.country) ?? context.country
  } catch {
    // Keep the code.
  }
  return context.region && context.region !== country ? `${context.region}, ${country}` : country
}

// ---------- Who the gift is for ----------

export const RELATIONSHIP_KINDS = ["partner", "parent", "grandparent", "sibling", "friend", "child", "colleague", "other"] as const
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number]

// What Majnu assumes until the visitor says otherwise (docs/plan.md): a partner
// is about 20 to 35, a mother or father about 45 to 70, a grandparent about 65
// to 90, and a friend or sibling close to the sender's age when it is known.
// Undefined when there is nothing sensible to assume.
export function defaultAgeRange(kind: RelationshipKind, senderAge?: number): [number, number] | undefined {
  switch (kind) {
    case "partner":
      return [20, 35]
    case "parent":
      return [45, 70]
    case "grandparent":
      return [65, 90]
    case "friend":
    case "sibling":
      if (senderAge === undefined || !Number.isFinite(senderAge) || senderAge < 10 || senderAge > 110) return undefined
      return [Math.max(10, Math.round(senderAge) - 5), Math.round(senderAge) + 5]
    default:
      return undefined
  }
}

// An age range the visitor gave, made sane: whole years, low to high, 0 to 120.
export function cleanAgeRange(range: { min?: number; max?: number } | undefined): [number, number] | undefined {
  if (!range) return undefined
  const min = range.min ?? range.max
  const max = range.max ?? range.min
  if (min === undefined || max === undefined || !Number.isFinite(min) || !Number.isFinite(max)) return undefined
  const low = Math.max(0, Math.min(120, Math.round(Math.min(min, max))))
  const high = Math.max(0, Math.min(120, Math.round(Math.max(min, max))))
  return [low, high]
}
