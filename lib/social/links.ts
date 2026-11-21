// What the sender pasted, turned into something we can read: an Instagram or
// TikTok profile (read with Apify), or another public web page (read with
// Tavily). Issue #34, docs/features/social-profiles.md.
//
// Only profiles are read, never a single post, and only pages on public
// hostnames: no IP addresses, localhost or internal names, so the address can
// only point at the public web.

export type ProfileSource = "instagram" | "tiktok" | "web"

export type ProfileTarget =
  | { source: "instagram" | "tiktok"; username: string }
  | { source: "web"; url: string }

export type LinkProblem =
  // A post, a reel, a search page: something on Instagram or TikTok that is not a profile.
  | "not_a_profile"
  // A bare handle without saying which platform it is on.
  | "needs_platform"
  // Not a link or handle we can read (an IP address, a short link, not a URL).
  | "unsupported"

export type ParsedLink = { ok: true; target: ProfileTarget } | { ok: false; problem: LinkProblem }

const MAX_LINK = 300

// Instagram usernames: letters, digits, periods and underscores, up to 30.
const INSTAGRAM_USERNAME = /^[A-Za-z0-9._]{1,30}$/
// TikTok usernames: letters, digits, periods and underscores, 2 to 24.
const TIKTOK_USERNAME = /^[A-Za-z0-9._]{2,24}$/

// First path segments on instagram.com that are not usernames.
const INSTAGRAM_RESERVED = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "legal",
  "developer", "web", "s", "challenge", "emails", "privacy", "terms", "session", "login",
])

const INSTAGRAM_HOSTS = new Set(["instagram.com", "instagr.am"])
const TIKTOK_HOSTS = new Set(["tiktok.com"])
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"])

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "").replace(/^(www|m)\./, "")
}

// A hostname on the public web: at least two labels, not an IP address, not
// localhost or a name that only resolves inside a network.
export function isPublicHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  if (!host || host.length > 253) return false
  if (host.startsWith("[") || host.includes(":")) return false // IPv6 literal
  if (/^\d+(\.\d+){0,3}$/.test(host)) return false // IPv4 literal, also 2130706433
  if (/^0x[0-9a-f]+$/i.test(host)) return false
  const labels = host.split(".")
  if (labels.length < 2 || labels.some((label) => !/^[a-z0-9-]{1,63}$/.test(label) || label.startsWith("-") || label.endsWith("-"))) {
    return false
  }
  const tld = labels[labels.length - 1]
  if (/^\d+$/.test(tld)) return false
  return !["localhost", "local", "internal", "intranet", "lan", "home", "corp", "test", "invalid", "example", "onion"].includes(tld)
}

function toUrl(text: string): URL | null {
  const withScheme = /^https?:\/\//i.test(text) ? text : /^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(text) ? `https://${text}` : null
  if (!withScheme) return null
  try {
    const url = new URL(withScheme)
    return url.protocol === "https:" || url.protocol === "http:" ? url : null
  } catch {
    return null
  }
}

function fromInstagram(url: URL): ParsedLink {
  const [first] = url.pathname.split("/").filter(Boolean)
  if (!first) return { ok: false, problem: "not_a_profile" }
  if (INSTAGRAM_RESERVED.has(first.toLowerCase()) || !INSTAGRAM_USERNAME.test(first)) return { ok: false, problem: "not_a_profile" }
  return { ok: true, target: { source: "instagram", username: first.toLowerCase() } }
}

function fromTikTok(url: URL): ParsedLink {
  const [first] = url.pathname.split("/").filter(Boolean)
  if (!first?.startsWith("@")) return { ok: false, problem: "not_a_profile" }
  const username = first.slice(1)
  if (!TIKTOK_USERNAME.test(username)) return { ok: false, problem: "not_a_profile" }
  return { ok: true, target: { source: "tiktok", username: username.toLowerCase() } }
}

// `platform` is what the model understood from the sender's words ("her insta
// is @anna"); it matters only for a bare handle. A full link decides by itself.
export function parseProfileLink(link: string, platform?: "instagram" | "tiktok" | null): ParsedLink {
  const text = link.trim().replace(/^[<("']+|[>)"'.,;!?]+$/g, "")
  if (!text || text.length > MAX_LINK || /\s/.test(text)) return { ok: false, problem: "unsupported" }

  // A bare handle: "@anna.climbs", or "anna.climbs" when the sender said where.
  const bare = !text.includes("/") && !/^https?:/i.test(text)
  if (bare && (text.startsWith("@") || Boolean(platform) || !text.includes("."))) {
    const handle = text.replace(/^@/, "")
    if (!platform) return INSTAGRAM_USERNAME.test(handle) ? { ok: false, problem: "needs_platform" } : { ok: false, problem: "unsupported" }
    const pattern = platform === "instagram" ? INSTAGRAM_USERNAME : TIKTOK_USERNAME
    if (!pattern.test(handle)) return { ok: false, problem: "unsupported" }
    return { ok: true, target: { source: platform, username: handle.toLowerCase() } }
  }

  const url = toUrl(text)
  if (!url || url.username || url.password) return { ok: false, problem: "unsupported" }
  if (url.port && url.port !== "443" && url.port !== "80") return { ok: false, problem: "unsupported" }
  if (!isPublicHostname(url.hostname)) return { ok: false, problem: "unsupported" }

  const host = hostKey(url.hostname)
  if (INSTAGRAM_HOSTS.has(host)) return fromInstagram(url)
  // Short links redirect to a video, and resolving them would mean fetching them.
  if (TIKTOK_SHORT_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, problem: "not_a_profile" }
  if (TIKTOK_HOSTS.has(host)) return fromTikTok(url)

  // Any other public page. Tavily fetches it, over https.
  url.protocol = "https:"
  url.hash = ""
  return { ok: true, target: { source: "web", url: url.toString() } }
}

// Whether a read costs Apify credit, and so counts against APIFY_DAILY_CAP.
export function usesApify(source: ProfileSource): boolean {
  return source === "instagram" || source === "tiktok"
}
