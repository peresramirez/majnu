import { describe, expect, it } from "vitest"
import {
  EMPTY_TRAIL,
  MAX_TRAIL,
  backDestination,
  parseIntent,
  parseTrail,
  recordVisit,
  referrerPath,
  resolveBack,
  trailPath,
  trailTarget,
  type BackIntent,
  type Trail,
} from "@/lib/navigation/back"

const ORIGIN = "https://majnu.app"

// Visits each path in turn, as the recorder does on every page change.
function visit(...paths: string[]): Trail {
  return paths.reduce((trail, path) => recordVisit(trail, path), EMPTY_TRAIL)
}

const member = { signedIn: true }
const visitor = { signedIn: false }

describe("trailPath", () => {
  it("keeps the pathname and the query", () => {
    expect(trailPath("/privacy")).toBe("/privacy")
    expect(trailPath("/dashboard", "?template=postcard")).toBe("/dashboard?template=postcard")
    expect(trailPath("/dashboard", "template=postcard")).toBe("/dashboard?template=postcard")
    expect(trailPath("/dashboard", "?")).toBe("/dashboard")
  })

  it("does not remember routes that are not pages to come back to", () => {
    expect(trailPath("/auth/callback", "?code=abc")).toBeNull()
    expect(trailPath("/api/open")).toBeNull()
    expect(trailPath("/billing/return", "?session_id=cs_test")).toBeNull()
    expect(trailPath("/dev/templates/postcard")).toBeNull()
    expect(trailPath("//evil.example/x")).toBeNull()
    expect(trailPath("evil")).toBeNull()
  })
})

describe("backDestination", () => {
  it("accepts paths on this site and drops the fragment", () => {
    expect(backDestination("/", visitor)).toBe("/")
    expect(backDestination("/l/abc123", visitor)).toBe("/l/abc123")
    expect(backDestination("/privacy#cookies", visitor)).toBe("/privacy")
    expect(backDestination("/dashboard/templates?kind=gift", member)).toBe("/dashboard/templates?kind=gift")
  })

  it("never leaves the site", () => {
    for (const path of [
      "https://evil.example/",
      "//evil.example/",
      "/\\evil.example",
      "javascript:alert(1)",
      "/\t/evil.example",
      "",
      42,
      null,
    ]) {
      expect(backDestination(path, member)).toBeNull()
    }
  })

  it("never goes back to a route that is not a page", () => {
    for (const path of ["/auth/callback", "/api/open", "/billing/return"]) {
      expect(backDestination(path, visitor)).toBeNull()
      expect(backDestination(path, member)).toBeNull()
    }
  })

  it("sends a signed-out visitor back to the sign-in page they came from, and a member never", () => {
    for (const path of ["/signin", "/signin?next=%2Fdashboard%2Fcreate", "/signup"]) {
      expect(backDestination(path, visitor)).toBe(path)
      expect(backDestination(path, member)).toBeNull()
    }
    expect(backDestination("//evil.example/signin", visitor)).toBeNull()
  })

  it("sends a guest back to the sign-in page too, since guests use it to keep their gifts", () => {
    const guest = { signedIn: true, member: false }
    expect(backDestination("/signin", guest)).toBe("/signin")
    expect(backDestination("/signup?next=%2Fdashboard%2Fgifts", guest)).toBe("/signup?next=%2Fdashboard%2Fgifts")
    // Guests have an account, so app pages stay open to them.
    expect(backDestination("/dashboard/gifts", guest)).toBe("/dashboard/gifts")
    const trail = visit("/dashboard/find", "/signin", "/terms")
    expect(resolveBack({ trail, current: "/terms", signedIn: true, member: false, fallback: "/dashboard/find" }).href).toBe("/signin")
    expect(resolveBack({ trail, current: "/terms", signedIn: true, fallback: "/dashboard/find" }).href).toBe("/dashboard/find")
  })

  it("keeps app pages for people who are signed in", () => {
    expect(backDestination("/dashboard/gifts", member)).toBe("/dashboard/gifts")
    expect(backDestination("/create/123", member)).toBe("/create/123")
    expect(backDestination("/dashboard/gifts", visitor)).toBeNull()
    expect(backDestination("/create/123", visitor)).toBeNull()
    // Look-alikes are ordinary pages.
    expect(backDestination("/dashboardx", visitor)).toBe("/dashboardx")
  })
})

describe("recordVisit", () => {
  it("adds new pages after the current one", () => {
    expect(visit("/", "/privacy", "/terms")).toEqual({ entries: ["/", "/privacy", "/terms"], index: 2 })
  })

  it("changes nothing for the page it is already on (a reload, a second listener)", () => {
    const trail = visit("/", "/privacy")
    expect(recordVisit(trail, "/privacy")).toBe(trail)
  })

  it("reads the page just before as the back button and the page just after as forward", () => {
    const back = recordVisit(visit("/", "/privacy", "/terms"), "/privacy")
    expect(back).toEqual({ entries: ["/", "/privacy", "/terms"], index: 1 })
    expect(recordVisit(back, "/terms")).toEqual({ entries: ["/", "/privacy", "/terms"], index: 2 })
  })

  it("drops the pages ahead when a new page is visited", () => {
    const back = recordVisit(visit("/", "/privacy", "/terms"), "/privacy")
    expect(recordVisit(back, "/impressum")).toEqual({ entries: ["/", "/privacy", "/impressum"], index: 2 })
  })

  it("moves to the entry a Back link named", () => {
    const trail = visit("/dashboard/find", "/signin", "/privacy")
    const intent: BackIntent = { path: "/dashboard/find", index: 0 }
    expect(recordVisit(trail, "/dashboard/find", intent)).toEqual({ entries: ["/dashboard/find"], index: 0 })
  })

  it("puts a fallback in the current entry's place", () => {
    const trail = visit("/signin", "/privacy")
    expect(recordVisit(trail, "/", { path: "/", index: 1 })).toEqual({ entries: ["/signin", "/"], index: 1 })
  })

  it("ignores an intent written for another page", () => {
    const trail = visit("/", "/privacy")
    expect(recordVisit(trail, "/terms", { path: "/", index: 0 })).toEqual({ entries: ["/", "/privacy", "/terms"], index: 2 })
  })

  it("keeps the newest entries when it is full", () => {
    const paths = Array.from({ length: MAX_TRAIL + 5 }, (_, i) => `/l/${i}`)
    const trail = visit(...paths)
    expect(trail.entries).toHaveLength(MAX_TRAIL)
    expect(trail.entries[trail.index]).toBe(`/l/${MAX_TRAIL + 4}`)
    expect(trail.entries[0]).toBe("/l/5")
  })
})

describe("parseTrail and parseIntent", () => {
  it("accept what recordVisit writes", () => {
    const trail = visit("/", "/privacy")
    expect(parseTrail(JSON.parse(JSON.stringify(trail)))).toEqual(trail)
    expect(parseIntent({ path: "/", index: 0 })).toEqual({ path: "/", index: 0 })
  })

  it("treat anything malformed as nothing", () => {
    for (const value of [null, "x", {}, { entries: [], index: 0 }, { entries: ["/"], index: 1 }, { entries: ["https://evil.example"], index: 0 }, { entries: ["/"], index: -1 }, { entries: [1], index: 0 }]) {
      expect(parseTrail(value)).toEqual(EMPTY_TRAIL)
    }
    expect(parseIntent({ path: "/", index: -1 })).toBeNull()
    expect(parseIntent({ path: 1, index: 0 })).toBeNull()
    expect(parseIntent(null)).toBeNull()
  })
})

describe("trailTarget", () => {
  it("skips entries that are not allowed and copies of the current page", () => {
    const trail = visit("/", "/terms", "/signin", "/privacy")
    const target = trailTarget(trail, "/privacy", (p) => backDestination(p, member))
    expect(target).toEqual({ path: "/terms", index: 1 })
  })
})

describe("referrerPath", () => {
  it("reads same-site referrers only", () => {
    expect(referrerPath("https://majnu.app/l/abc?x=1#y", ORIGIN)).toBe("/l/abc?x=1")
    expect(referrerPath("https://evil.example/l/abc", ORIGIN)).toBeNull()
    expect(referrerPath("http://majnu.app/", ORIGIN)).toBeNull()
    expect(referrerPath("not a url", ORIGIN)).toBeNull()
    expect(referrerPath("", ORIGIN)).toBeNull()
  })
})

describe("resolveBack", () => {
  const legal = { fallback: "/" }

  it("goes back to the page the visitor came from on this site", () => {
    // A member who opened Privacy from My gifts (issue #66).
    const trail = visit("/dashboard/find", "/dashboard/gifts", "/privacy")
    expect(resolveBack({ trail, current: "/privacy", signedIn: true, fallback: "/dashboard/find" })).toEqual({
      href: "/dashboard/gifts",
      intent: { path: "/dashboard/gifts", index: 1 },
      from: "trail",
    })
    // A recipient who opened Privacy from a gift page.
    const fromGift = visit("/l/abc123", "/privacy")
    expect(resolveBack({ trail: fromGift, current: "/privacy", signedIn: false, ...legal }).href).toBe("/l/abc123")
  })

  it("counts the current page even before the recorder has run", () => {
    const trail = visit("/", "/dashboard/gifts")
    expect(resolveBack({ trail, current: "/privacy", signedIn: true, fallback: "/dashboard/find" }).href).toBe("/dashboard/gifts")
  })

  it("falls back per context when the tab has no earlier page", () => {
    const trail = visit("/privacy")
    expect(resolveBack({ trail, current: "/privacy", signedIn: true, fallback: "/dashboard/find" })).toMatchObject({
      href: "/dashboard/find",
      from: "fallback",
      intent: { path: "/dashboard/find", index: 0 },
    })
    expect(resolveBack({ trail, current: "/privacy", signedIn: false, ...legal }).href).toBe("/")
    expect(resolveBack({ trail: EMPTY_TRAIL, current: "/privacy", signedIn: false, ...legal }).href).toBe("/")
  })

  it("never sends a signed-out visitor to an app page, which would ask them to sign in", () => {
    // Signed out from the app, then opened the terms from the sign-in page:
    // back to the sign-in page, never to the app page before it.
    const trail = visit("/dashboard/gifts", "/signin", "/terms")
    expect(resolveBack({ trail, current: "/terms", signedIn: false, ...legal }).href).toBe("/signin")
    expect(resolveBack({ trail: visit("/dashboard/gifts", "/terms"), current: "/terms", signedIn: false, ...legal }).href).toBe("/")
    // A fallback that needs an account becomes the landing page.
    expect(resolveBack({ trail: visit("/terms"), current: "/terms", signedIn: false, fallback: "/dashboard/find" }).href).toBe("/")
  })

  it("honours a same-site next on the sign-in pages, but only one the visitor can open", () => {
    const trail = visit("/signin?next=%2Fdashboard%2Fcreate")
    const current = "/signin?next=%2Fdashboard%2Fcreate"
    // A guest sent from Create goes back to Create.
    expect(resolveBack({ trail, current, signedIn: true, next: "/dashboard/create", fallback: "/dashboard/find" })).toMatchObject({
      href: "/dashboard/create",
      from: "next",
    })
    // A signed-out visitor sent from an app page would only be sent back here.
    expect(resolveBack({ trail, current, signedIn: false, next: "/dashboard/create", ...legal }).href).toBe("/")
    // Never another site.
    expect(resolveBack({ trail, current, signedIn: false, next: "https://evil.example", ...legal }).href).toBe("/")
    expect(resolveBack({ trail, current, signedIn: false, next: "//evil.example", ...legal }).href).toBe("/")
  })

  it("prefers the page that really sent them over next", () => {
    const trail = visit("/", "/signin?next=%2Fdashboard%2Fcreate")
    expect(
      resolveBack({ trail, current: "/signin?next=%2Fdashboard%2Fcreate", signedIn: true, next: "/dashboard/create", fallback: "/dashboard/find" })
        .href,
    ).toBe("/")
  })

  it("from sign-up, skips the sign-in page it came through", () => {
    const trail = visit("/l/abc123", "/signin", "/signup")
    expect(resolveBack({ trail, current: "/signup", signedIn: false, ...legal }).href).toBe("/l/abc123")
  })

  it("uses a same-site referrer only when the trail has nothing earlier", () => {
    const only = visit("/privacy")
    const base = { current: "/privacy", signedIn: false, origin: ORIGIN, ...legal }
    expect(resolveBack({ ...base, trail: only, referrer: "https://majnu.app/l/abc" })).toMatchObject({ href: "/l/abc", from: "referrer" })
    expect(resolveBack({ ...base, trail: only, referrer: "https://evil.example/l/abc" }).href).toBe("/")
    expect(resolveBack({ ...base, trail: only, referrer: "https://majnu.app/privacy" }).href).toBe("/")
    expect(resolveBack({ ...base, trail: only, referrer: "https://majnu.app/signin" }).href).toBe("/signin")
    // With an earlier page in the trail, a stale referrer is ignored.
    expect(resolveBack({ ...base, trail: visit("/terms", "/privacy"), referrer: "https://majnu.app/l/abc" }).href).toBe("/terms")
  })
})

// Following Back links from any page must end, at a fallback, without visiting
// a page twice: each one moves the trail's position back, and fallbacks take
// the current entry's place.
describe("following Back links never loops", () => {
  type Page = { path: string; fallback: string; hasBack: boolean }
  const pages: Record<string, Page> = {
    "/": { path: "/", fallback: "/", hasBack: false },
    "/dashboard/find": { path: "/dashboard/find", fallback: "/dashboard/find", hasBack: false },
    "/privacy": { path: "/privacy", fallback: "/dashboard/find", hasBack: true },
    "/terms": { path: "/terms", fallback: "/dashboard/find", hasBack: true },
    "/impressum": { path: "/impressum", fallback: "/dashboard/find", hasBack: true },
    "/signin": { path: "/signin", fallback: "/", hasBack: true },
    "/signup": { path: "/signup", fallback: "/", hasBack: true },
    "/dashboard/templates": { path: "/dashboard/templates", fallback: "/dashboard/create", hasBack: true },
    "/dashboard/purchases": { path: "/dashboard/purchases", fallback: "/dashboard/gifts", hasBack: true },
    "/dashboard/create": { path: "/dashboard/create", fallback: "/dashboard/create", hasBack: false },
    "/dashboard/gifts": { path: "/dashboard/gifts", fallback: "/dashboard/gifts", hasBack: false },
    "/l/abc": { path: "/l/abc", fallback: "/", hasBack: false },
  }
  const paths = Object.keys(pages)

  // A small deterministic random walk, so the test is the same every run.
  function walk(seed: number, length: number): string[] {
    let x = seed
    const out: string[] = []
    for (let i = 0; i < length; i++) {
      x = (x * 1103515245 + 12345) % 2147483648
      out.push(paths[x % paths.length])
    }
    return out
  }

  for (const signedIn of [true, false]) {
    it(`ends at a page without a Back link (${signedIn ? "signed in" : "signed out"})`, () => {
      for (let seed = 1; seed <= 300; seed++) {
        const route = walk(seed, 2 + (seed % 12)).filter((p) => signedIn || !p.startsWith("/dashboard"))
        if (route.length === 0) continue
        let trail = visit(...route)
        let current = route[route.length - 1]
        const seen = new Set<string>()
        let steps = 0
        while (pages[current]?.hasBack) {
          const key = `${current}@${trail.index}`
          expect(seen.has(key)).toBe(false)
          seen.add(key)
          const back = resolveBack({ trail, current, signedIn, fallback: pages[current].fallback })
          expect(back.href.startsWith("/")).toBe(true)
          expect(back.href.startsWith("//")).toBe(false)
          // Members never land on a sign-in page; visitors may return to one.
          if (signedIn) expect(["/signin", "/signup"]).not.toContain(back.href)
          if (!signedIn) expect(back.href.startsWith("/dashboard")).toBe(false)
          trail = recordVisit(trail, back.href, back.intent)
          current = back.href
          steps++
          expect(steps).toBeLessThanOrEqual(MAX_TRAIL + 2)
        }
      }
    })
  }

  it("does not bounce between two legal pages", () => {
    // Landing, Privacy, Terms (footer), Privacy again (footer), then Back.
    let trail = visit("/", "/privacy", "/terms", "/privacy")
    let back = resolveBack({ trail, current: "/privacy", signedIn: false, fallback: "/" })
    expect(back.href).toBe("/")
    trail = recordVisit(trail, back.href, back.intent)
    // And from Terms opened afterwards, Back is the landing page, not Privacy again.
    trail = recordVisit(trail, "/terms")
    back = resolveBack({ trail, current: "/terms", signedIn: false, fallback: "/" })
    expect(back.href).toBe("/")
  })
})
