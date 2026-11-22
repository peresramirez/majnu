import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@/lib/agents/builder", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agents/builder")>()),
  buildContent: vi.fn(),
}))
vi.mock("@/lib/letters/store", () => ({ createLetter: vi.fn(), saveLetterContent: vi.fn() }))

import { BuilderInvalidOutput, buildContent } from "@/lib/agents/builder"
import type { GiftOption } from "@/lib/finder/events"
import { WRAP_TEMPLATES } from "@/components/finder/finder-state"
import { WRAP_TEMPLATE_IDS, giftFromOption, withChosenGift, wrapBrief, wrapOption } from "@/lib/finder/wrap"
import { letterFixtures } from "@/lib/letters/fixtures"
import { createLetter, saveLetterContent } from "@/lib/letters/store"

const OPTION: GiftOption = {
  id: "o2",
  title: "Fotobuch A4",
  description: "Ein Buch voller Fotos, 40 Seiten.",
  reason: "Sie liebt Erinnerungen.",
  price: "29,99 €",
  url: "https://fotobuch.example/a4?ref=majnu",
  imageUrl: "https://fotobuch.example/a4.jpg",
  shop: "Fotobuch",
}

const CONTEXT = { country: "DE", region: "Berlin", language: "de", currency: "EUR", relationship: "Mama", ageRange: [45, 70] as [number, number] }

const BUILT = {
  ...letterFixtures["gift-reveal"],
  recipientName: "Mama",
  // The builder made something up; the chosen option replaces it.
  gifts: [{ title: "Fotobuch", url: "https://evil.example/", imageUrl: "https://tracker.example/pixel.gif", price: "9 €" }],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(buildContent).mockResolvedValue({ kind: "letter", content: BUILT })
  vi.mocked(createLetter).mockResolvedValue({ id: "letter-1", slug: "AbCdEfGh34" })
  vi.mocked(saveLetterContent).mockResolvedValue()
})

describe("wrapBrief", () => {
  it("gives the builder the language, the relationship, the names and the gift to copy exactly", () => {
    const brief = wrapBrief({ option: OPTION, context: CONTEXT, templateId: "gift-reveal", recipientName: "Anna", senderName: "Javier", note: "Danke für alles." })
    expect(brief).toContain("Write everything in German (de).")
    expect(brief).toContain("Who the recipient is to the sender: Mama.")
    expect(brief).toContain("Recipient's name: Anna.")
    expect(brief).toContain("Sender's name: Javier.")
    expect(brief).toContain("<note>\nDanke für alles.\n</note>")
    expect(brief).toContain("- title: Fotobuch A4")
    expect(brief).toContain("- price: 29,99 €")
    expect(brief).toContain("- url: https://fotobuch.example/a4?ref=majnu")
    expect(brief).not.toContain(OPTION.imageUrl!)
  })

  it("tells the builder what to do without names or a note, and not to invent memories", () => {
    const brief = wrapBrief({ option: OPTION, context: CONTEXT, templateId: "postcard" })
    expect(brief).toContain("Recipient's name: not given.")
    expect(brief).toContain("Sender's name: not given. Do not invent one.")
    expect(brief).toContain("Do not invent memories")
    expect(brief).toContain("leave event out")
  })

  it("passes on the occasion the finder heard (issue #59)", () => {
    const brief = wrapBrief({ option: OPTION, context: { ...CONTEXT, occasion: "Geburtstag" }, templateId: "party-box" })
    expect(brief).toContain("Occasion, as the sender told the gift finder: Geburtstag. Use it as occasion, written in German")
    expect(brief).not.toContain("Celebration")
  })

  it("gives a party box a celebrating occasion when the sender named none", () => {
    expect(wrapBrief({ option: OPTION, context: CONTEXT, templateId: "party-box" })).toContain("such as \"Celebration\"")
    expect(wrapBrief({ option: OPTION, context: CONTEXT, templateId: "gift-box-3d" })).toContain("such as \"Just because\"")
  })
})

describe("WRAP_TEMPLATE_IDS", () => {
  it("are the five gift templates, the same ones the finder offers", () => {
    expect([...WRAP_TEMPLATE_IDS].sort()).toEqual([...WRAP_TEMPLATES].sort())
    expect(WRAP_TEMPLATE_IDS).toEqual(expect.arrayContaining(["gift-box-3d", "party-box"]))
  })
})

describe("the gift on the page", () => {
  it("is exactly the chosen option, without its image", () => {
    expect(giftFromOption(OPTION)).toEqual({
      title: "Fotobuch A4",
      description: "Ein Buch voller Fotos, 40 Seiten.",
      url: "https://fotobuch.example/a4?ref=majnu",
      price: "29,99 €",
    })
    expect(withChosenGift(BUILT, OPTION).gifts).toEqual([giftFromOption(OPTION)])
  })
})

describe("wrapOption", () => {
  it("builds the page, then creates and saves the letter with a generic title", async () => {
    const result = await wrapOption({
      option: OPTION,
      context: CONTEXT,
      templateId: "gift-reveal",
      now: new Date("2026-11-21T15:00:00Z"),
      timezone: "Europe/Berlin",
    })

    expect(result).toEqual({ letterId: "letter-1", slug: "AbCdEfGh34" })
    expect(buildContent).toHaveBeenCalledWith(expect.objectContaining({ mode: "build", templateId: "gift-reveal", timezone: "Europe/Berlin" }))
    expect(vi.mocked(buildContent).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createLetter).mock.invocationCallOrder[0])
    const [id, saved] = vi.mocked(saveLetterContent).mock.calls[0]
    expect(id).toBe("letter-1")
    expect(saved).toMatchObject({ kind: "letter", templateId: "gift-reveal", title: "A gift for Mama" })
    expect(saved.content).toEqual({ ...BUILT, gifts: [giftFromOption(OPTION)] })
    expect(JSON.stringify(saved)).not.toContain("imageUrl")
  })

  it("wraps in the 3D gift box and the party box, always as a gift, with the chosen gift card and no invented event", async () => {
    vi.mocked(buildContent).mockResolvedValue({ kind: "letter", content: { ...letterFixtures["party-box"], recipientName: "Mama" } })
    for (const templateId of ["gift-box-3d", "party-box"] as const) {
      await wrapOption({ option: OPTION, context: CONTEXT, templateId, now: new Date(), timezone: "Europe/Berlin" })
      expect(buildContent).toHaveBeenLastCalledWith(expect.objectContaining({ templateId, giftRequired: true }))
      const [, saved] = vi.mocked(saveLetterContent).mock.calls.at(-1)!
      expect(saved).toMatchObject({ templateId, title: "A gift for Mama" })
      expect(saved.content).toMatchObject({ gifts: [giftFromOption(OPTION)] })
      // The party fixture has an event; the finder never knows one.
      expect(saved.content).not.toHaveProperty("event")
    }
  })

  it("creates no letter when the build fails", async () => {
    vi.mocked(buildContent).mockRejectedValue(new BuilderInvalidOutput(["a gift reveal needs at least one gift"]))
    await expect(
      wrapOption({ option: OPTION, context: CONTEXT, templateId: "gift-reveal", now: new Date(), timezone: "Europe/Berlin" }),
    ).rejects.toBeInstanceOf(BuilderInvalidOutput)
    expect(createLetter).not.toHaveBeenCalled()
  })
})
