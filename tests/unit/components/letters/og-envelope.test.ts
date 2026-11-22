// The rules behind the link-preview envelope. The image (og-envelope-image.tsx)
// takes only what envelopeName and envelopeKind return, so these tests are what
// keeps the message, gifts and event out of every preview.
import { describe, expect, it } from "vitest"
import { envelopeKind, envelopeName, nameFontSize } from "@/components/letters/og-envelope"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import type { LetterContent, LetterTemplateId, PublicLetter } from "@/lib/letters/schema"

const letter = (templateId: LetterTemplateId, content: LetterContent = letterFixtures[templateId]): PublicLetter => ({
  kind: "letter",
  slug: "abc",
  templateId,
  content,
  ownerPreview: false,
})

const withName = (recipientName: string) => letter("classic-envelope", { ...letterFixtures["classic-envelope"], recipientName })

describe("envelopeName", () => {
  it("addresses the envelope to one person's first name only, never a surname", () => {
    expect(envelopeName(withName("Anna"))).toBe("Anna")
    expect(envelopeName(withName("Anna Schmidt"))).toBe("Anna")
    expect(envelopeName(withName("Zoë"))).toBe("Zoë")
    expect(envelopeName(withName("Łukasz"))).toBe("Łukasz")
    expect(envelopeName(withName("D’Arcy"))).toBe("D’Arcy")
  })

  it("addresses the envelope to a group as a whole (issue #62)", () => {
    expect(envelopeName(withName("our friends"))).toBe("our friends")
    expect(envelopeName(withName("Mia & Leo"))).toBe("Mia & Leo")
    expect(envelopeName(withName("the Smiths"))).toBe("the Smiths")
  })

  it('says "you" when there is no letter or no name', () => {
    expect(envelopeName(null)).toBe("you")
    expect(envelopeName(withName(""))).toBe("you")
  })

  // Anything the embedded font cannot draw would make next/og send the name to Google Fonts.
  it('says "you" for names the embedded font cannot draw', () => {
    expect(envelopeName(withName("ليلى"))).toBe("you")
    expect(envelopeName(withName("Аня"))).toBe("you")
    expect(envelopeName(withName("Mia🎉"))).toBe("you")
    expect(envelopeName(withName("Mi­a"))).toBe("you")
  })
})

describe("envelopeKind", () => {
  it("names the kind of gift", () => {
    expect(envelopeKind(letter("gift-reveal"))).toBe("A gift")
    expect(envelopeKind({ templateId: "advent-classic" })).toBe("An advent calendar")
    expect(envelopeKind(null)).toBe("A letter")
  })
})

describe("what reaches the image", () => {
  it("never includes the message, the gifts or the event", () => {
    for (const [id, content] of Object.entries(letterFixtures)) {
      const l = letter(id as LetterTemplateId, content)
      const text = `${envelopeKind(l)} ${envelopeName(l)}`
      const secrets = [
        content.headline,
        ...content.body,
        content.signOff,
        ...content.gifts.flatMap((g) => [g.title, g.code, g.url, g.description]),
        content.event?.title,
        content.event?.locationName,
        content.event?.address,
      ].filter((s): s is string => Boolean(s))
      for (const s of secrets) expect(text).not.toContain(s)
    }
  })

  it("never includes a calendar's doors", () => {
    const cal = calendarFixtures["advent-classic"]
    const view: Pick<PublicLetter, "content"> = {
      content: { ...cal, doors: cal.doors.map((d) => ({ day: d.day, locked: true as const, opensOn: "2026-12-01" })) },
    }
    const text = `${envelopeKind({ templateId: "advent-classic" })} ${envelopeName(view)}`
    expect(text).toBe("An advent calendar Lena")
  })
})

describe("nameFontSize", () => {
  it("shrinks long names to stay on the envelope", () => {
    expect(nameFontSize("Tom")).toBe(104)
    expect(nameFontSize("Maximiliane")).toBeLessThan(104)
    expect(nameFontSize("x".repeat(40))).toBe(28)
  })
})
