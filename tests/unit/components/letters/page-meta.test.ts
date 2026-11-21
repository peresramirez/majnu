import { describe, expect, it } from "vitest"
import { letterMetadata, letterViewport } from "@/components/letters/page-meta"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import type { PublicLetter } from "@/lib/letters/schema"

const gift: PublicLetter = { kind: "letter", slug: "abc", templateId: "gift-reveal", content: letterFixtures["gift-reveal"], ownerPreview: false }

describe("letterMetadata", () => {
  const meta = letterMetadata(gift)
  const text = JSON.stringify(meta)

  it("uses a generic title and description", () => {
    expect(meta.title).toEqual({ absolute: "A gift for Tom" })
    expect(meta.openGraph).toMatchObject({ title: "A gift for Tom", description: "Made for Tom with Majnu." })
  })

  it("keeps the page out of search engines and sends no referrer", () => {
    expect(meta.robots).toMatchObject({ index: false, follow: false })
    expect(meta.referrer).toBe("no-referrer")
  })

  it("never includes the message, the gift or its code", () => {
    const c = letterFixtures["gift-reveal"]
    for (const s of [c.headline, ...c.body, c.signOff, c.gifts[0].title, c.gifts[0].code!, c.gifts[0].url!]) expect(text).not.toContain(s)
  })

  it("names a calendar without its doors", () => {
    const cal = calendarFixtures["advent-classic"]
    const m = letterMetadata({
      kind: "calendar",
      slug: "cal",
      templateId: "advent-classic",
      content: { ...cal, doors: cal.doors.map((d) => ({ day: d.day, locked: true as const, opensOn: "2026-12-01" })) },
      ownerPreview: false,
    })
    expect(m.title).toEqual({ absolute: "An advent calendar for Lena" })
    expect(JSON.stringify(m)).not.toContain(cal.headline)
  })

  it("stays hidden for a missing letter", () => {
    expect(letterMetadata(null).robots).toMatchObject({ index: false })
  })
})

describe("letterViewport", () => {
  it("matches the browser bar to the palette", () => {
    expect(letterViewport(gift).themeColor).toBe("#F1D2C4")
    expect(letterViewport(null).themeColor).toBe("#1B1226")
  })
})
