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
  // A host close to instagram.com, tiktok.com or linkedin.com that is not on
  // the explicit typo list, or a typo'd host whose path is not clearly a
  // profile: nothing is read, and `suggestion` is the link it probably meant,
  // for Majnu to offer as an answer to tap (issue #89).
  | "maybe_typo"

// `corrected` is set when an obvious misspelling of the platform's address was
// fixed before reading (issue #89): the link that was read, for Majnu to name.
export type ParsedLink =
  | { ok: true; target: ProfileTarget; corrected?: string }
  | { ok: false; problem: LinkProblem; suggestion?: string }

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

// Obvious misspellings of the three platforms' addresses (issue #89), mapped
// before any read when the path is clearly a profile: /in/<name> for LinkedIn,
// /<name> or /@<name> for Instagram and TikTok. Explicit and tested
// (tests/unit/lib/social/links.test.ts), so nothing is guessed. instagr.am is
// Instagram's own short domain and is read as instagram.com above.
export const TYPO_HOSTS: Readonly<Record<string, ProfilePlatform>> = {
  // LinkedIn
  "linked.com": "linkedin",
  "linkdin.com": "linkedin",
  "linkedln.com": "linkedin",
  "linkedin.co": "linkedin",
  "linkedin.cm": "linkedin",
  "linkedin.con": "linkedin",
  "linkedinn.com": "linkedin",
  "linkedn.com": "linkedin",
  "linkein.com": "linkedin",
  "lnkedin.com": "linkedin",
  "likedin.com": "linkedin",
  "linkeding.com": "linkedin",
  "linkdin.co": "linkedin",
  // Instagram
  "instagram.co": "instagram",
  "instagram.cm": "instagram",
  "instagram.con": "instagram",
  "insta.com": "instagram",
  "instagam.com": "instagram",
  "instgram.com": "instagram",
  "intagram.com": "instagram",
  "instagrm.com": "instagram",
  "instagran.com": "instagram",
  "instagramm.com": "instagram",
  "insatgram.com": "instagram",
  // TikTok
  "tiktok.co": "tiktok",
  "tiktok.cm": "tiktok",
  "tiktok.con": "tiktok",
  "tik-tok.com": "tiktok",
  "tiktock.com": "tiktok",
  "tictok.com": "tiktok",
  "ticktok.com": "tiktok",
  "ticktock.com": "tiktok",
  "tiktoc.com": "tiktok",
  "tiktk.com": "tiktok",
}

// The address of a profile as Majnu names it: "linkedin.com/in/anna".
export function profileLink(platform: ProfilePlatform, username: string): string {
  if (platform === "linkedin") return `linkedin.com/in/${username}`
  if (platform === "tiktok") return `tiktok.com/@${username}`
  return `instagram.com/${username}`
}
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

// The profile a typo'd host's path clearly names, or null.
function typoProfile(platform: ProfilePlatform, url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean)
  if (platform === "linkedin") {
    if (segments.length < 2 || segments[0].toLowerCase() !== "in") return null
    return linkedinName(segments[1])
  }
  if (segments.length !== 1) return null
  const name = segments[0].replace(/^@/, "")
  if (platform === "instagram" && INSTAGRAM_RESERVED.has(name.toLowerCase())) return null
  return HANDLE_PATTERNS[platform].test(name) ? name.toLowerCase() : null
}

// For a host that is not a platform but looks like one: the profile link it
// probably meant, from a path that is a single name (linked.com/anna-schmidt),
// or null when nothing sensible can be offered.
function guessProfile(platform: ProfilePlatform, url: URL): string | null {
  const segments = url.pathname.split("/").filter(Boolean)
  const name = platform === "linkedin" && segments[0]?.toLowerCase() === "in" ? segments[1] : segments.length === 1 ? segments[0] : undefined
  if (!name) return null
  const handle = platform === "linkedin" ? linkedinName(name) : name.replace(/^@/, "")
  if (!handle || !HANDLE_PATTERNS[platform].test(handle)) return null
  if (platform === "instagram" && INSTAGRAM_RESERVED.has(handle.toLowerCase())) return null
  return profileLink(platform, platform === "linkedin" ? handle : handle.toLowerCase())
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j++) {
      const saved = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1))
      previous = saved
    }
  }
  return row[b.length]
}

// A host whose name is one or two letters away from a platform's
// ("linkedim.com", "tiktak.com"), on any top-level domain: worth asking about,
// never worth reading on a guess.
function nearPlatform(host: string): ProfilePlatform | null {
  const label = host.split(".")[0]
  for (const platform of ["linkedin", "instagram", "tiktok"] as const) {
    if (label !== platform && label.length >= 4 && editDistance(label, platform) <= 2) return platform
  }
  return null
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

  // An obvious misspelling of a platform's address, with a profile's path:
  // read the profile it meant, and say so. With another path, ask.
  const typo = TYPO_HOSTS[host]
  if (typo) {
    const username = typoProfile(typo, url)
    if (username) return { ok: true, target: { source: typo, username }, corrected: profileLink(typo, username) }
    const suggestion = guessProfile(typo, url)
    return suggestion ? { ok: false, problem: "maybe_typo", suggestion } : { ok: false, problem: "not_a_profile" }
  }
  // Short links redirect to a video, and resolving them would mean fetching them.
  if (TIKTOK_SHORT_HOSTS.has(url.hostname.toLowerCase())) return { ok: false, problem: "not_a_profile" }
  if (TIKTOK_HOSTS.has(host)) return fromTikTok(url)
  if (LINKEDIN_SHORT_HOSTS.has(host)) return { ok: false, problem: "not_a_profile" }
  if (isLinkedInHost(url.hostname)) return fromLinkedIn(url)

  // Close to a platform's name but not on the list: ask, don't read.
  const near = nearPlatform(host)
  if (near) {
    const suggestion = guessProfile(near, url)
    if (suggestion) return { ok: false, problem: "maybe_typo", suggestion }
  }

  // Any other public page. Tavily fetches it, over https.
  url.protocol = "https:"
  url.hash = ""
  return { ok: true, target: { source: "web", url: url.toString() } }
}

// The same profile or page however it was written ("www.", a trailing slash,
// capitals), so a session tries each link once (issue #89).
export function targetKey(target: ProfileTarget): string {
  if (target.source !== "web") return `${target.source}:${target.username.toLowerCase()}`
  const url = new URL(target.url)
  const path = url.pathname.replace(/\/+$/, "")
  return `web:${hostKey(url.hostname)}${path}${url.search}`
}

// What a session keeps of a link it tried: a short SHA-256 of targetKey(),
// never the link itself.
export async function linkFingerprint(target: ProfileTarget): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(targetKey(target))))
  return Array.from(bytes.slice(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

// Sources read by a paid scraper (Apify or Bright Data, both billed per
// profile or record), which count against APIFY_DAILY_CAP. Tavily pages do not.
export const PAID_SOURCES: readonly ProfileSource[] = ["instagram", "tiktok", "linkedin"]

// Whether a read is paid for per profile and so counts against
// APIFY_DAILY_CAP. The name is older than Bright Data; LinkedIn counts too.
export function usesApify(source: ProfileSource): boolean {
  return PAID_SOURCES.includes(source)
}
