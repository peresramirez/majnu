import { describe, expect, it } from "vitest"
import { MAX_DESIGN_BYTES } from "@/lib/daytona/config"
import { checkDesignHtml, normalizeUrl } from "@/lib/daytona/validate"

const GIFT_URL = "https://shop.example/gift?id=1&ref=2"
const CODE = "SPA-2026-XYZ"
const KEY = "sk-ant-api03-test-key-0123456789abcdef"

// A page that follows every rule: inline style and script, data: images,
// SVG fragment references, the gift link, and the code only in the script.
const GOOD = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>A gift for Lucia</title>
<style>
  body { font-family: "Iowan Old Style", Georgia, serif; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3C/svg%3E"); }
  .ticket { fill: url(#glow); }
  @media (prefers-reduced-motion: no-preference) { .ticket { animation: rise 600ms ease-out both; } }
  @keyframes rise { from { opacity: 0 } }
</style>
</head>
<body>
<main>
  <h1>Happy birthday, Lucia</h1>
  <svg xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 10 10">
    <defs><radialGradient id="glow"><stop offset="0" stop-color="#fff"/></radialGradient></defs>
    <rect class="ticket" width="10" height="10" fill="url(#glow)"/>
    <use href="#glow"/>
  </svg>
  <img src="data:image/png;base64,iVBORw0KGgo=" alt="">
  <a href="https://shop.example/gift?id=1&amp;ref=2" target="_blank" rel="noopener noreferrer">Open your gift</a>
  <button id="reveal" type="button">Reveal your code</button>
  <p id="code" aria-live="polite"></p>
</main>
<script>
  const code = "${CODE}";
  const ns = "http://www.w3.org/2000/svg";
  const shop = "${GIFT_URL}";
  for (let i = 0; i < 3 && i > -1; i++) {}
  document.getElementById("reveal").addEventListener("click", () => {
    document.getElementById("code").textContent = code;
  });
</script>
</body>
</html>
`

function check(html: string) {
  return checkDesignHtml(html, { allowedLinks: [GIFT_URL], giftCodes: [CODE], secrets: [KEY] })
}

function problemsOf(html: string): string[] {
  const result = check(html)
  return result.ok ? [] : result.problems
}

const withInBody = (snippet: string) => GOOD.replace("</main>", `${snippet}\n</main>`)
const withInScript = (snippet: string) => GOOD.replace("</script>", `${snippet}\n</script>`)
const withInStyle = (snippet: string) => GOOD.replace("</style>", `${snippet}\n</style>`)

describe("checkDesignHtml", () => {
  it("accepts a page that follows the rules", () => {
    const result = check(GOOD)
    expect(result).toEqual({ ok: true, bytes: new TextEncoder().encode(GOOD).length })
  })

  it.each([
    ["an external script", withInBody('<script src="https://cdn.example/x.js"></script>'), /script with src/],
    ["a stylesheet link", GOOD.replace("</head>", '<link rel="stylesheet" href="https://fonts.example/css">\n</head>'), /<link>/],
    ["a tracking pixel", withInBody('<img src="https://tracker.example/p.gif" alt="">'), /from src on <img>/],
    ["a protocol-relative image", withInBody("<img src='//tracker.example/p.gif' alt=''>"), /from src on <img>/],
    ["an unquoted image URL", withInBody("<IMG SRC=https://tracker.example/p.gif>"), /from src on <img>/],
    ["a video poster", withInBody('<video poster="https://x.example/p.jpg"></video>'), /from poster on <video>/],
    ["a remote CSS background", withInStyle("main { background: url(https://x.example/bg.jpg) }"), /CSS url\(\)/],
    ["a remote web font", withInStyle('@font-face { font-family: X; src: url("https://fonts.example/x.woff2") }'), /CSS url\(\)/],
    ["a remote image in a style attribute", withInBody(`<div style="background-image:url('https://x.example/a.png')"></div>`), /CSS url\(\)/],
    ["an @import", withInStyle("@import 'theme.css';"), /@import/],
    ["image-set()", withInStyle('main { background: image-set("a.png" 1x) }'), /image-set/],
    ["fetch", withInScript('fetch("/api/x")'), /fetch\(\)/],
    ["XMLHttpRequest", withInScript("new XMLHttpRequest()"), /XMLHttpRequest/],
    ["WebSocket", withInScript('new WebSocket("wss://x.example")'), /WebSocket/],
    ["EventSource", withInScript('new EventSource("/stream")'), /EventSource/],
    ["sendBeacon", withInScript('navigator.sendBeacon("/t", "x")'), /sendBeacon/],
    ["WebRTC", withInScript("new RTCPeerConnection()"), /RTCPeerConnection/],
    ["cookies", withInScript('document.cookie = "a=1"'), /document\.cookie/],
    ["localStorage", withInScript('localStorage.setItem("seen", "1")'), /localStorage/],
    ["sessionStorage", withInScript('sessionStorage.getItem("x")'), /sessionStorage/],
    ["indexedDB", withInScript('indexedDB.open("x")'), /indexedDB/],
    ["a worker", withInScript('new Worker("w.js")'), /web worker/],
    ["window.open", withInScript("window.open(shop)"), /window\.open/],
    ["a location change", withInScript("location.href = shop"), /location change/],
    ["location.assign", withInScript("window.location.assign(shop)"), /location change/],
    ["a dynamic import", withInScript('import("./x.js")'), /dynamic import/],
    ["a module import", withInScript('import confetti from "https://cdn.example/confetti.js"'), /module import/],
    ["eval", withInScript('eval("1 + 1")'), /eval\(\)/],
    ["new Function", withInScript('new Function("return 1")()'), /new Function/],
    ["a URL hidden in a script", withInScript('const sink = "https://collect.example/x"'), /names "https:\/\/collect\.example\/x" in a script/],
    ["a form", withInBody('<form action="https://x.example"><input name="q"></form>'), /<form>/],
    ["an iframe", withInBody('<iframe src="https://x.example"></iframe>'), /<iframe>/],
    ["an upper-case iframe", withInBody("<IFRAME SRC=x></IFRAME>"), /<iframe>/],
    ["an object", withInBody('<object data="x.swf"></object>'), /<object>/],
    ["an embed", withInBody('<embed src="x.swf">'), /<embed>/],
    ["a base element", GOOD.replace("<head>", '<head><base href="https://x.example/">'), /<base>/],
    ["a meta refresh", GOOD.replace("<head>", '<head><meta http-equiv="refresh" content="0;url=https://x.example">'), /http-equiv/],
    ["a link to another site", withInBody('<a href="https://elsewhere.example/">More</a>'), /not a gift link/],
    ["a plain http gift link", withInBody('<a href="http://shop.example/gift?id=1&amp;ref=2">Gift</a>'), /not https/],
    ["a javascript: link", withInBody('<a href="javascript:alert(1)">Tap</a>'), /not https/],
    ["an entity-encoded javascript: link", withInBody('<a href="&#106;avascript&colon;alert(1)">Tap</a>'), /not https/],
    ["a data: link", withInBody('<a href="data:text/html,<p>hi</p>">Tap</a>'), /not https/],
    ["a link ping", withInBody(`<a href="${GIFT_URL.replace("&", "&amp;")}" ping="https://t.example">Gift</a>`), /ping attribute/],
    ["srcset", withInBody('<img src="data:image/png;base64,AA" srcset="https://x.example/a.png 2x" alt="">'), /srcset attribute/],
    ["srcdoc", withInBody('<div srcdoc="<p>x</p>"></div>'), /srcdoc attribute/],
    ["a remote SVG image", withInBody('<svg><image href="https://x.example/a.png"/></svg>'), /href on <image>/],
    ["a remote SVG use", withInBody('<svg><use xlink:href="https://x.example/s.svg#a"/></svg>'), /xlink:href on <use>/],
  ])("rejects %s", (_name, html, problem) => {
    expect(problemsOf(html).join("\n")).toMatch(problem)
  })

  it("rejects a gift code in the markup, and accepts it inside the script", () => {
    expect(problemsOf(withInBody(`<p>${CODE}</p>`))).toContain("shows a gift code before the recipient taps")
    expect(problemsOf(withInBody('<p data-x="SPA-2026-XYZ"></p>'))).toContain("shows a gift code before the recipient taps")
    expect(check(GOOD).ok).toBe(true)
  })

  it("tells a location change from a variable called location", () => {
    expect(check(withInScript("const location = 'Café Einstein'; let place = location;")).ok).toBe(true)
    expect(problemsOf(withInScript("window.location = shop"))).toContain("uses a location change")
    expect(problemsOf(withInScript("location = shop"))).toContain("uses a location change")
    expect(problemsOf(withInScript("document.location.href = shop"))).toContain("uses a location change")
  })

  it("rejects a page that contains a key, without repeating the key", () => {
    const problems = problemsOf(withInBody(`<p>${KEY}</p>`))
    expect(problems).toContain("contains a secret key")
    expect(problems.join("\n")).not.toContain(KEY)
  })

  it("rejects anything that looks like an Anthropic key even when it is not ours", () => {
    expect(problemsOf(withInScript('const k = "sk-ant-api03-somebody-elses-key"'))).toContain(
      "contains something that looks like an Anthropic key",
    )
  })

  it("rejects pages without a doctype, too small or too large", () => {
    expect(problemsOf(GOOD.replace("<!doctype html>", ""))).toContain("does not start with <!doctype html>")
    expect(problemsOf("<!doctype html><p>hi</p>")).toContain("is too short to be a page")
    const huge = withInBody(`<p>${"x".repeat(MAX_DESIGN_BYTES)}</p>`)
    expect(problemsOf(huge).join("\n")).toMatch(/over the 500 KB limit/)
  })

  it("compares gift links after decoding entities and normalising the URL", () => {
    const result = checkDesignHtml(withInBody('<a href="https://SHOP.example/gift?id=1&amp;ref=2">Again</a>'), {
      allowedLinks: [GIFT_URL],
      giftCodes: [CODE],
    })
    expect(result.ok).toBe(true)
  })

  it("lists every problem once", () => {
    const html = withInScript('fetch("/a"); fetch("/b")')
    expect(problemsOf(html).filter((p) => p === "uses fetch()")).toHaveLength(1)
  })
})

describe("normalizeUrl", () => {
  it("normalises absolute URLs and rejects relative ones", () => {
    expect(normalizeUrl("https://Shop.Example/a b")).toBe("https://shop.example/a%20b")
    expect(normalizeUrl("/relative")).toBeNull()
    expect(normalizeUrl("not a url")).toBeNull()
  })
})
