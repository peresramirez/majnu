// /pitch (app/(pitch)/pitch/page.tsx): without the cookie the server renders
// the password screen and nothing of the deck. Every piece of text the
// unlocked deck renders is collected and looked for in the locked page, and
// the deck's words are kept out of every file that reaches the browser.
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
let cookie: string | undefined
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "majnu_pitch" && cookie !== undefined ? { name, value: cookie } : undefined),
  }),
}))

import PitchPage from "@/app/(pitch)/pitch/page"
import { DECK_LABELS, pitchSlides } from "@/components/pitch/slides"
import { FINDER_LIMITS } from "@/lib/finder/limits"
import { pitchCookieValue } from "@/lib/pitch/gate"
import { wrapper } from "@/lib/plans"
import { PITCH_NOTES, PITCH_SLIDE_IDS } from "@/lib/pitch/notes"

async function render(search: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await PitchPage({ searchParams: Promise.resolve(search) }))
}

const decode = (text: string) =>
  text
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;| /g, " ")

// The slides alone, without the deck's controls around them.
const slidesOf = (html: string) => (html.match(/<section id="slide-[\s\S]*?<\/section>/g) ?? []).join("")

// Every run of text, alt text and label in a page, at least `min` characters long.
function strings(html: string, min = 6): string[] {
  const found = new Set<string>()
  for (const [, text] of html.matchAll(/>([^<>]+)</g)) {
    const t = decode(text).trim()
    if (t.length >= min) found.add(t)
  }
  for (const [, text] of html.matchAll(/(?:alt|aria-label)="([^"]+)"/g)) {
    const t = decode(text).trim()
    if (t.length >= min) found.add(t)
  }
  return [...found]
}

let unlocked = ""

beforeEach(async () => {
  cookie = await pitchCookieValue()
  unlocked = await render()
  cookie = undefined
})

describe("/pitch with the cookie", () => {
  it("renders all nine slides with their words, and hands the deck their notes", () => {
    expect(unlocked.match(/class="pd-slide"/g)).toHaveLength(9)
    for (const text of [
      "Have you ever wondered…?",
      "Finding the perfect gift isn’t easy.",
      "Majnu does the rest.",
      "More than a card",
      "How it works inside",
      "Free to find and send",
      "Make thoughtful, personal gifts easy for everyone.",
      "Layla plans the journey.",
      "The agents and the data",
    ]) {
      expect(decode(unlocked), text).toContain(text)
    }
    // The notes go to the deck as props (in the RSC payload once unlocked)
    // and show only in the presenter view.
    expect(pitchSlides().map((slide) => [slide.id, slide.notes])).toEqual(PITCH_SLIDE_IDS.map((id) => [id, PITCH_NOTES[id]]))
  })

  it("shows the real price and the finder's real limits", () => {
    expect(unlocked).toContain(`${wrapper.price} once`)
    expect(unlocked).toContain(`${FINDER_LIMITS.sessionsPerDay} sessions a day, ${FINDER_LIMITS.searchesPerSession} searches each.`)
  })
})

describe("/pitch without the cookie", () => {
  it("renders only the password screen, posting to /pitch/unlock", async () => {
    const locked = await render()
    expect(locked).toContain('action="/pitch/unlock"')
    expect(locked).toContain('name="password"')
    expect(locked).not.toContain("pd-slide")
    expect(locked).not.toContain("That&#x27;s not it")
  })

  it("contains none of the deck's text, labels, pictures or notes", async () => {
    const locked = decode(await render())
    const deck = strings(unlocked)
    expect(deck.length).toBeGreaterThan(80)
    const leaked = deck.filter((text) => text !== "Majnu" && locked.includes(text))
    expect(leaked).toEqual([])
    for (const id of PITCH_SLIDE_IDS) expect(locked).not.toContain(PITCH_NOTES[id].slice(0, 40))
    for (const asset of ["/pitch/step-", "majnu-layla", "pd-passage", "qr"]) expect(locked).not.toContain(asset)
  })

  it("says only \"That's not it\" after a wrong password", async () => {
    const locked = await render({ wrong: "1" })
    expect(locked).toContain("That&#x27;s not it")
    expect(locked).not.toContain("pd-slide")
  })

  it("stays locked with a forged or old cookie", async () => {
    for (const forged of ["", "1", "x".repeat(64), "27fd4464f31c5d8a8aa3cdeb6427df59584cfc93252879d507d87af80c7779da"]) {
      cookie = forged
      expect(await render(), forged).not.toContain("pd-slide")
    }
  })
})

describe("the deck's words stay on the server", () => {
  const root = join(__dirname, "../../../..")
  const read = (path: string) => readFileSync(join(root, path), "utf8")

  it("keeps the slides, the diagrams, the notes and the gate in server-only modules", () => {
    for (const path of ["components/pitch/slides.tsx", "components/pitch/diagrams.tsx", "lib/pitch/notes.ts", "lib/pitch/gate.ts"]) {
      expect(read(path), path).toMatch(/^import "server-only"$/m)
    }
  })

  it("puts none of the deck's text in a file that reaches the browser", () => {
    const clientFiles = [
      ...readdirSync(join(root, "components/pitch"))
        .map((name) => `components/pitch/${name}`)
        .filter((path) => read(path).startsWith('"use client"')),
      "lib/pitch/navigation.ts",
      "app/(pitch)/pitch/deck.css",
    ]
    expect(clientFiles).toEqual(expect.arrayContaining(["components/pitch/deck.tsx", "components/pitch/password-screen.tsx"]))
    // The slides, the notes and the controls' labels: the controller's bundle
    // also loads with the password screen, so it must not hint at a deck.
    const deck = [
      ...strings(slidesOf(unlocked), 12),
      ...PITCH_SLIDE_IDS.map((id) => PITCH_NOTES[id]),
      ...Object.values(DECK_LABELS).filter((label) => label.length >= 6),
    ]
    expect(deck.length).toBeGreaterThan(60)
    for (const path of clientFiles) {
      const source = read(path)
      expect(source, path).not.toMatch(/from "(\.\/slides|\.\/diagrams|@\/lib\/pitch\/notes|@\/lib\/pitch\/gate)"/)
      expect(deck.filter((text) => source.includes(text)), path).toEqual([])
    }
  })
})

describe("the deck's stylesheet", () => {
  // A custom property registered with @property in app/globals.css takes its
  // type everywhere: the landing page registers --u as a number, which once
  // turned every canvas size of the deck to zero.
  it("uses no custom property that the site's global stylesheet registers", () => {
    const root = join(__dirname, "../../../..")
    const registered = [...readFileSync(join(root, "app/globals.css"), "utf8").matchAll(/@property\s+(--[\w-]+)/g)].map((m) => m[1])
    const deck = readFileSync(join(root, "app/(pitch)/pitch/deck.css"), "utf8")
    const used = new Set([...deck.matchAll(/(--[\w-]+)\s*:|var\((--[\w-]+)/g)].map((m) => m[1] ?? m[2]))
    expect(registered.filter((name) => used.has(name))).toEqual([])
  })
})

describe("the spoken script", () => {
  const script = readFileSync(join(__dirname, "../../../../docs/pitch-script.md"), "utf8")

  it("is the same in the presenter view and in docs/pitch-script.md", () => {
    for (const id of PITCH_SLIDE_IDS) expect(script, id).toContain(PITCH_NOTES[id])
  })

  it("is about 260 words for the eight main slides, two minutes at a calm pace", () => {
    const words = PITCH_SLIDE_IDS.filter((id) => id !== "appendix")
      .map((id) => PITCH_NOTES[id].split(/\s+/).length)
      .reduce((a, b) => a + b, 0)
    expect(words).toBeGreaterThanOrEqual(240)
    expect(words).toBeLessThanOrEqual(280)
  })
})
