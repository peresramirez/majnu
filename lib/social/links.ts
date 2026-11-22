// What the sender pasted, turned into something we can read: an Instagram or
// TikTok profile (read with Apify, Instagram also with Bright Data), a
// LinkedIn profile (read with Bright Data, issue #74), or another public web
// page (read with Tavily). Issue #34, docs/features/social-profiles.md.
//
// Only a person's profile is read, never a single post or a company page, and
// only pages on public hostnames: no IP addresses, localhost or internal names,
// so the address can only point at the public web.

export type ProfileSource = "instagram" | "tiktok" | "linkedin" | "web"

export type ProfilePlatform = "instagram" | "tiktok" | "linkedin"

// `username` is the LinkedIn profile's public name for LinkedIn ("anna-schmidt-1a2b3c").
export type ProfileTarget =
  | { source: ProfilePlatform; username: string }
  | { source: "web"; url: string }

export type LinkProblem =
  // A post, a reel, a search page, a LinkedIn company page: something on
  // Instagram, TikTok or LinkedIn that is not a person's profile.
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
// LinkedIn public profile names: letters (in any script), digits and hyphens,
// 3 to 100; generated ones also carry digits ("anna-schmidt-1a2b3c").
const LINKEDIN_NAME = /^[\p{L}\p{N}][\p{L}\p{N}_-]{2,99}$/u

// First path segments on instagram.com that are not usernames.
const INSTAGRAM_RESERVED = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "about", "legal",
  "developer", "web", "s", "challenge", "emails", "privacy", "terms", "session", "login",
])

const INSTAGRAM_HOSTS = new Set(["instagram.com", "instagr.am"])
const TIKTOK_HOSTS = new Set(["tiktok.com"])
const TIKTOK_SHORT_HOSTS = new Set(["vm.tiktok.com", "vt.tiktok.com"])
const LINKEDIN_SHORT_HOSTS = new Set(["lnkd.in"])

// linkedin.com and every subdomain of it: www, m, and the country ones (de., uk.).
function isLinkedInHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  return host === "linkedin.com" || host.endsWith(".linkedin.com")
}

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

function linkedinName(segment: string): string | null {
  let name: string
  try {
    name = decodeURIComponent(segment)
  } catch {
    return null
  }
  return LINKEDIN_NAME.test(name) ? name : null
}

// Only linkedin.com/in/<name>, also from a page under it (/in/<name>/details/experience).
// Company, school, job and post pages are not a person's profile.
function fromLinkedIn(url: URL): ParsedLink {
  const [first, second] = url.pathname.split("/").filter(Boolean)
  if (first?.toLowerCase() !== "in" || !second) return { ok: false, problem: "not_a_profile" }
  const name = linkedinName(second)
  if (!name) return { ok: false, problem: "not_a_profile" }
  return { ok: true, target: { source: "linkedin", username: name } }
}

const HANDLE_PATTERNS: Record<ProfilePlatform, RegExp> = {
  instagram: INSTAGRAM_USERNAME,
  tiktok: TIKTOK_USERNAME,
  linkedin: LINKEDIN_NAME,
}

// `platform` is what the model understood from the sender's words ("her insta
// is @anna"); it matters only for a bare handle. A full link decides by itself.
export function parseProfileLink(link: string, platform?: ProfilePlatform | null): ParsedLink {
  const text = link.trim().replace(/^[<("']+|[>)"'.,;!?]+$/g, "")
  if (!text || text.length > MAX_LINK || /\s/.test(text)) return { ok: false, problem: "unsupported" }

  // A bare handle: "@anna.climbs", or "anna.climbs" when the sender said where.
  const bare = !text.includes("/") && !/^https?:/i.test(text)
  if (bare && (text.startsWith("@") || Boolean(platform) || !text.includes("."))) {
    const handle = text.replace(/^@/, "")
    if (!platform) return INSTAGRAM_USERNAME.test(handle) ? { ok: false, problem: "needs_platform" } : { ok: false, problem: "unsupported" }
    if (!HANDLE_PATTERNS[platform].test(handle)) return { ok: false, problem: "unsupported" }
    // LinkedIn's generated names can be case sensitive; Instagram and TikTok names are not.
    return { ok: true, target: { source: platform, username: platform === "linkedin" ? handle : handle.toLowerCase() } }
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
  if (LINKEDIN_SHORT_HOSTS.has(host)) return { ok: false, problem: "not_a_profile" }
  if (isLinkedInHost(url.hostname)) return fromLinkedIn(url)

  // Any other public page. Tavily fetches it, over https.
  url.protocol = "https:"
  url.hash = ""
  return { ok: true, target: { source: "web", url: url.toString() } }
}

// Sources read by a paid scraper (Apify or Bright Data, both billed per
// profile or record), which count against APIFY_DAILY_CAP. Tavily pages do not.
export const PAID_SOURCES: readonly ProfileSource[] = ["instagram", "tiktok", "linkedin"]

// Whether a read is paid for per profile and so counts against
// APIFY_DAILY_CAP. The name is older than Bright Data; LinkedIn counts too.
export function usesApify(source: ProfileSource): boolean {
  return PAID_SOURCES.includes(source)
}
