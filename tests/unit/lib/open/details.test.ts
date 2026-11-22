// What /api/open records about an open besides the time: place, language,
// device, and which user agents are crawlers (lib/open/details.ts).
import { beforeEach, describe, expect, it, vi } from "vitest"

let cf: Record<string, unknown> | undefined
let onWorkers = true
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: () => {
    if (!onWorkers) throw new Error("not on Workers")
    return { cf, env: {}, ctx: {} }
  },
}))

import { cleanCity, deviceType, isCrawler, openDetails, openLocation, primaryLanguage, requestCf } from "@/lib/open/details"

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  firefoxAndroidTablet: "Mozilla/5.0 (Android 14; Tablet; rv:132.0) Gecko/132.0 Firefox/132.0",
  ipad: "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 357.0.0.25.101",
  facebookApp:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22B83 [FBAN/FBIOS;FBAV/490.0.0.40.107]",
  telegramApp:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Telegram-Android/11.4.2",
}

function request(headers: Record<string, string> = {}) {
  return new Request("https://majnu.app/api/open", { method: "POST", headers })
}

beforeEach(() => {
  cf = undefined
  onWorkers = true
})

describe("openLocation: the cf fallback chain", () => {
  it("reads the country and city from Cloudflare's request data, and nothing more precise", () => {
    cf = {
      country: "DE",
      city: "Berlin",
      region: "Berlin",
      regionCode: "BE",
      postalCode: "10115",
      latitude: "52.52",
      longitude: "13.40",
      timezone: "Europe/Berlin",
      asn: 3320,
    }
    const headers = new Headers({ "cf-ipcountry": "FR", "cf-connecting-ip": "203.0.113.7" })
    expect(openLocation(cf, headers)).toEqual({ country: "DE", city: "Berlin" })
  })

  it("falls back to the CF-IPCountry header, with no city", () => {
    expect(openLocation(undefined, new Headers({ "cf-ipcountry": "at" }))).toEqual({ country: "AT", city: null })
    expect(openLocation({ city: "Wien" }, new Headers({ "cf-ipcountry": "AT" }))).toEqual({ country: "AT", city: null })
  })

  it("has no place in local dev, for unknown countries and for Tor", () => {
    expect(openLocation(undefined, new Headers())).toEqual({ country: null, city: null })
    expect(openLocation({ country: "XX", city: "Nowhere" }, new Headers())).toEqual({ country: null, city: null })
    expect(openLocation({ country: "T1" }, new Headers({ "cf-ipcountry": "T1" }))).toEqual({ country: null, city: null })
    expect(openLocation({ country: "DEU" }, new Headers({ "cf-ipcountry": "1A" }))).toEqual({ country: null, city: null })
  })

  it("requestCf() is Cloudflare's data on Workers and undefined elsewhere", () => {
    cf = { country: "CH" }
    expect(requestCf()).toEqual({ country: "CH" })
    onWorkers = false
    expect(requestCf()).toBeUndefined()
  })

  it("keeps a city to one short line", () => {
    expect(cleanCity("  São   Paulo ")).toBe("São Paulo")
    expect(cleanCity("Ber\nlin\u0000")).toBe("Ber lin")
    expect(cleanCity("x".repeat(81))).toBeNull()
    expect(cleanCity("   ")).toBeNull()
    expect(cleanCity(42)).toBeNull()
  })
})

describe("primaryLanguage", () => {
  it("takes the primary subtag of the most preferred language", () => {
    expect(primaryLanguage("de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7")).toBe("de")
    expect(primaryLanguage("en-GB")).toBe("en")
    expect(primaryLanguage("PT-br")).toBe("pt")
    expect(primaryLanguage("fil")).toBe("fil")
  })

  it("weighs ranges by q, with ties going to the first", () => {
    expect(primaryLanguage("en;q=0.5, fr;q=0.9, de;q=0.9")).toBe("fr")
    expect(primaryLanguage("en;q=0, es")).toBe("es")
  })

  it("skips wildcards, private tags and malformed ranges", () => {
    expect(primaryLanguage("*")).toBeNull()
    expect(primaryLanguage("*, it;q=0.5")).toBe("it")
    expect(primaryLanguage("x-pig-latin, i-klingon")).toBeNull()
    expect(primaryLanguage("de;q=2, nl;q=abc, sv")).toBe("sv")
    expect(primaryLanguage("<script>")).toBeNull()
    expect(primaryLanguage("")).toBeNull()
    expect(primaryLanguage(null)).toBeNull()
  })
})

describe("deviceType", () => {
  it("tells phones, tablets and desktops apart", () => {
    expect(deviceType(UA.iphone)).toBe("phone")
    expect(deviceType(UA.androidPhone)).toBe("phone")
    expect(deviceType(UA.instagram)).toBe("phone")
    expect(deviceType(UA.androidTablet)).toBe("tablet")
    expect(deviceType(UA.firefoxAndroidTablet)).toBe("tablet")
    expect(deviceType(UA.ipad)).toBe("tablet")
    expect(deviceType(UA.mac)).toBe("desktop")
    expect(deviceType(UA.windows)).toBe("desktop")
  })

  it("is unknown without a user agent", () => {
    expect(deviceType("")).toBeNull()
    expect(deviceType("   ")).toBeNull()
    expect(deviceType(null)).toBeNull()
  })
})

describe("isCrawler", () => {
  it("recognises link-preview services, search engines, headless browsers and HTTP libraries", () => {
    for (const ua of [
      "WhatsApp/2.24.23.78 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0",
      "TelegramBot (like TwitterBot)",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
      "Mozilla/5.0 (compatible; SomeNewCrawler)",
      "curl/8.7.1",
      "python-requests/2.32.3",
    ]) {
      expect(isCrawler(ua), ua).toBe(true)
    }
  })

  it("lets real browsers through, in-app browsers of chat apps included", () => {
    for (const ua of Object.values(UA)) expect(isCrawler(ua), ua).toBe(false)
    expect(isCrawler("")).toBe(false)
  })
})

describe("openDetails", () => {
  it("combines the place, language and device of one request, and never the IP address", () => {
    cf = { country: "DE", city: "München", latitude: "48.1", longitude: "11.6" }
    const details = openDetails(
      request({
        "accept-language": "de-DE,de;q=0.9,en;q=0.8",
        "user-agent": UA.iphone,
        "cf-connecting-ip": "203.0.113.7",
      }),
    )
    expect(details).toEqual({ country: "DE", city: "München", language: "de", device: "phone" })
    expect(JSON.stringify(details)).not.toContain("203.0.113.7")
  })

  it("uses the CF-IPCountry header when there is no request data, and nothing in local dev", () => {
    onWorkers = false
    expect(openDetails(request({ "cf-ipcountry": "GB", "user-agent": UA.windows }))).toEqual({
      country: "GB",
      city: null,
      language: null,
      device: "desktop",
    })
    expect(openDetails(request())).toEqual({ country: null, city: null, language: null, device: null })
  })
})
