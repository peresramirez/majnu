import "server-only"
import { httpsOnly } from "./safe-url"
import { productImage } from "./tavily"

// The product photo a shop page names for link previews (og:image, the one
// WhatsApp shows), for gift ideas the search returned without one. About half
// of the researcher's ideas had no photo (developer's report, 22 November).
// Only the page's <head> is read, with a short timeout; a shop that refuses
// robots, or a page with no usable image, simply leaves the idea without one,
// and the card shows one of Majnu's own gift pictures instead.

const TIMEOUT_MS = 3_000
const MAX_BYTES = 400_000
const USER_AGENT = "Mozilla/5.0 (compatible; MajnuBot/1.0; +https://majnu.app)"
const IMAGE_KEYS = new Set(["og:image", "og:image:url", "og:image:secure_url", "twitter:image", "twitter:image:src"])

function attribute(tag: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag)
  return match ? (match[1] ?? match[2]) : undefined
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&#x2F;|&#47;/gi, "/")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
}

// The preview image a page's meta tags name, made absolute, if it passes the
// same checks as a search image (https, not a logo, badge or tiny graphic).
export function imageFromHtml(html: string, pageUrl: string): string | undefined {
  const found: string[] = []
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attribute(tag, "property") ?? attribute(tag, "name") ?? "").trim().toLowerCase()
    if (!IMAGE_KEYS.has(key)) continue
    const content = attribute(tag, "content")?.trim()
    if (!content) continue
    try {
      found.push(new URL(decodeEntities(content), pageUrl).toString())
    } catch {
      // Not a URL: skip it.
    }
  }
  return productImage(found)
}

async function readHead(response: Response): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const decoder = new TextDecoder()
  let text = ""
  let bytes = 0
  try {
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      text += decoder.decode(value, { stream: true })
      if (/<\/head>/i.test(text.slice(-value.byteLength - 8))) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }
  return text
}

export async function pageImage(url: string, fetchImpl: typeof fetch = fetch): Promise<string | undefined> {
  const safe = httpsOnly(url)
  if (!safe) return undefined
  try {
    const response = await fetchImpl(safe, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok || !/html/i.test(response.headers.get("content-type") ?? "")) {
      await response.body?.cancel().catch(() => undefined)
      return undefined
    }
    return imageFromHtml(await readHead(response), response.url || safe)
  } catch {
    return undefined
  }
}

// Fills in a photo for each idea that has a link and none yet, all at once.
export async function withPageImages<T extends { url?: string; imageUrl?: string }>(ideas: T[], fetchImpl: typeof fetch = fetch): Promise<T[]> {
  return Promise.all(
    ideas.map(async (idea) => {
      if (idea.imageUrl || !idea.url) return idea
      const imageUrl = await pageImage(idea.url, fetchImpl)
      return imageUrl ? { ...idea, imageUrl } : idea
    }),
  )
}
