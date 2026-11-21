// Checks a page Claude Code made in the sandbox before we store it and serve it
// from our domain. It enforces the page rules of the majnu-letter skill
// (daytona/sandbox/.claude/skills/majnu-letter/SKILL.md) that can be checked
// mechanically.
//
// This is defence in depth, not the boundary. The boundary is the response
// header of /l/<slug>/design (lib/daytona/designs.ts): a sandboxed document
// with `default-src 'none'`, which the browser enforces whatever the HTML
// says. The check exists so a page that tries to break the rules is never
// stored at all, and so a mistake by the model is caught before a recipient
// sees a half-broken page. It works on the raw text with regular expressions,
// so it errs on the side of rejecting.
import { MAX_DESIGN_BYTES, MIN_DESIGN_BYTES } from "./config"

export type DesignCheckInput = {
  // The gift links in the letter's content: the only https links allowed.
  allowedLinks: string[]
  // Gift codes, which must not appear in the markup (only inside a script,
  // inserted when the recipient taps).
  giftCodes?: string[]
  // Keys that must never appear in the page, should a prompt injection have
  // talked the model into printing its environment.
  secrets?: string[]
}

export type DesignCheck = { ok: true; bytes: number } | { ok: false; bytes: number; problems: string[] }

// Elements that load, embed or submit something, or change how URLs resolve.
const FORBIDDEN_ELEMENTS =
  /<\s*(form|iframe|frame|frameset|object|embed|applet|base|link|portal|fencedframe|template\s+shadowrootmode)\b/gi
const META_HTTP_EQUIV = /<meta\b[^>]*\bhttp-equiv\b/i
const SCRIPT_SRC = /<script\b[^>]*\bsrc\s*=/i

// Browser APIs that reach the network, store something or leave the page.
const FORBIDDEN_APIS: [RegExp, string][] = [
  [/\bfetch\s*\(/, "fetch()"],
  [/\bXMLHttpRequest\b/, "XMLHttpRequest"],
  [/\bWebSocket\b/, "WebSocket"],
  [/\bEventSource\b/, "EventSource"],
  [/\bsendBeacon\b/, "navigator.sendBeacon"],
  [/\bRTCPeerConnection\b/, "RTCPeerConnection"],
  [/\bdocument\s*\.\s*cookie\b/, "document.cookie"],
  [/\blocalStorage\b/, "localStorage"],
  [/\bsessionStorage\b/, "sessionStorage"],
  [/\bindexedDB\b/, "indexedDB"],
  [/\bcaches\s*\.\s*open\b/, "the Cache API"],
  [/\bserviceWorker\b/, "a service worker"],
  [/\bimportScripts\b/, "importScripts"],
  [/\bnew\s+(Shared)?Worker\s*\(/, "a web worker"],
  [/\b(window|self|top|parent|globalThis)\s*\.\s*open\s*\(/, "window.open"],
  [/\blocation\s*\.\s*(assign|replace)\s*\(/, "a location change"],
  [/\blocation\s*\.\s*href\s*=(?!=)/, "a location change"],
  // Assigning to location itself, but not a variable that happens to be
  // called location (`const location = event.locationName`).
  [/(?<!\b(?:const|let|var)\s+)(?<![\w$])location\s*=(?!=)/, "a location change"],
  [/\bimport\s*\(/, "a dynamic import"],
  [/\bimport\s+[\w{*][^;]*?\bfrom\s*["']/, "a module import"],
  [/\beval\s*\(/, "eval()"],
  [/\bnew\s+Function\s*\(/, "new Function()"],
  [/@import\b/, "a CSS @import"],
  [/\bimage-set\s*\(/, "CSS image-set()"],
]

// Attributes that make the browser fetch or submit something, or that this
// page has no use for. Each is rejected outright, whatever its value.
const FORBIDDEN_ATTRIBUTES = new Set([
  "action",
  "formaction",
  "ping",
  "srcset",
  "imagesrcset",
  "srcdoc",
  "manifest",
  "codebase",
  "archive",
  "longdesc",
  "lowsrc",
  "dynsrc",
  "icon",
  "cite",
  "data",
])

// Attributes that load what they name: only data: URIs (or a #fragment).
const LOADING_ATTRIBUTES = new Set(["src", "poster", "background"])
const LINK_ATTRIBUTES = new Set(["href", "xlink:href"])

// SVG and MathML namespace URLs are names, not requests; scripts need them for
// createElementNS.
const NAMESPACE_URL = /^http:\/\/www\.w3\.org\//

const TAG = /<([a-zA-Z][a-zA-Z0-9:-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g
const ATTRIBUTE = /([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi
const SCRIPT_URL = /\bhttps?:\/\/[^\s"'`<>)\\]+/gi

export function checkDesignHtml(html: string, input: DesignCheckInput): DesignCheck {
  const bytes = new TextEncoder().encode(html).length
  const problems = new Set<string>()
  const allowed = new Set(input.allowedLinks.map(normalizeUrl).filter((url): url is string => url !== null))

  if (bytes > MAX_DESIGN_BYTES) problems.add(`is ${Math.round(bytes / 1024)} KB, over the ${MAX_DESIGN_BYTES / 1024} KB limit`)
  if (bytes < MIN_DESIGN_BYTES) problems.add("is too short to be a page")
  if (!/^\s*<!doctype html>/i.test(html)) problems.add("does not start with <!doctype html>")

  for (const secret of input.secrets ?? []) {
    if (secret && secret.length >= 8 && html.includes(secret)) problems.add("contains a secret key")
  }
  if (/sk-ant-[A-Za-z0-9_-]{8,}/.test(html)) problems.add("contains something that looks like an Anthropic key")

  for (const match of html.matchAll(FORBIDDEN_ELEMENTS)) problems.add(`contains a <${match[1].toLowerCase()}> element`)
  if (META_HTTP_EQUIV.test(html)) problems.add("contains <meta http-equiv>")
  if (SCRIPT_SRC.test(html)) problems.add("loads a script with src")

  for (const [pattern, name] of FORBIDDEN_APIS) {
    if (pattern.test(html)) problems.add(`uses ${name}`)
  }

  // CSS url(...) anywhere: in <style>, style attributes, SVG paint and scripts.
  for (const match of html.matchAll(CSS_URL)) {
    const value = decodeEntities(match[1] ?? match[2] ?? match[3] ?? "").trim()
    if (!isLocalReference(value)) problems.add(`loads ${describe(value)} with CSS url()`)
  }

  // Scripts must not carry URLs they could load later, except the gift links.
  for (const script of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    for (const match of script[1].matchAll(SCRIPT_URL)) {
      const url = match[0]
      if (NAMESPACE_URL.test(url)) continue
      const normalized = normalizeUrl(url)
      if (!normalized || !allowed.has(normalized)) problems.add(`names ${describe(url)} in a script`)
    }
  }

  // Attributes, on the markup only: script and style bodies can contain "<"
  // that would read as tags.
  const markup = html
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi, "$1$2")
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/gi, "$1$2")
    .replace(/<!--[\s\S]*?-->/g, "")
  for (const tag of markup.matchAll(TAG)) {
    const element = tag[1].toLowerCase()
    for (const attribute of (tag[2] ?? "").matchAll(ATTRIBUTE)) {
      const name = attribute[1].toLowerCase()
      const value = decodeEntities(attribute[2] ?? attribute[3] ?? attribute[4] ?? "").trim()
      if (FORBIDDEN_ATTRIBUTES.has(name)) {
        problems.add(`uses the ${name} attribute on <${element}>`)
      } else if (LOADING_ATTRIBUTES.has(name)) {
        if (!isDataUri(value)) problems.add(`loads ${describe(value)} from ${name} on <${element}>`)
      } else if (LINK_ATTRIBUTES.has(name)) {
        if (value.startsWith("#")) continue
        if (element !== "a") {
          if (!isDataUri(value)) problems.add(`points ${name} on <${element}> at ${describe(value)}`)
          continue
        }
        const normalized = normalizeUrl(value)
        if (!normalized?.startsWith("https://")) problems.add(`links to ${describe(value)}, which is not https`)
        else if (!allowed.has(normalized)) problems.add(`links to ${describe(value)}, which is not a gift link in the letter`)
      }
    }
  }

  // Codes go into the page only when the recipient taps (from the script).
  const markupText = decodeEntities(markup)
  for (const code of input.giftCodes ?? []) {
    if (code.trim().length >= 4 && markupText.includes(code.trim())) problems.add("shows a gift code before the recipient taps")
  }

  return problems.size === 0 ? { ok: true, bytes } : { ok: false, bytes, problems: [...problems] }
}

// data: URIs and same-document #fragments are the only things a page may load.
function isLocalReference(value: string): boolean {
  return value.startsWith("#") || isDataUri(value)
}

function isDataUri(value: string): boolean {
  // Browsers ignore tabs and newlines inside a URL scheme ("da\nta:").
  return value.replace(/[\u0000- ]/g, "").toLowerCase().startsWith("data:")
}

// The form we compare links in, or null if it is not an absolute URL.
export function normalizeUrl(value: string): string | null {
  try {
    return new URL(value.trim()).href
  } catch {
    return null
  }
}

function describe(value: string): string {
  if (!value) return "an empty URL"
  return `"${value.length > 80 ? `${value.slice(0, 77)}...` : value}"`
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  colon: ":",
  sol: "/",
  tab: "\t",
  newline: "\n",
  lpar: "(",
  rpar: ")",
  period: ".",
  nbsp: " ",
}

// Enough of HTML's character references to see through "&#106;avascript:" and
// "&colon;" tricks in attribute values.
function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);?/gi, (whole, ref: string) => {
    if (ref[0] === "#") {
      const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10)
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? whole
  })
}
