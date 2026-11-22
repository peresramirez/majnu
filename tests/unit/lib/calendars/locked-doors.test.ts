// Issue #48: gifts the sender picked for a door must never reach the
// recipient's browser before that door opens. The public view is everything
// /l/<slug> renders and every public response is built from; the rendered HTML
// is checked live with curl (docs/features/advent-calendar.md), because these
// tests do not transform JSX.
import { describe, expect, it } from "vitest"
import { giftFromOption, initialContent, ownGift, setDoor } from "@/lib/calendars/doors"
import type { GiftOption } from "@/lib/finder/events"
import { toPublicView } from "@/lib/letters/public-view"
import type { CalendarContent, LetterRecord } from "@/lib/letters/schema"

const PICKED: GiftOption = {
  id: "o7",
  title: "Geheimes Lavendel-Badesalz",
  description: "Ein Badesalz, das niemand vorher sehen darf.",
  reason: "Sie liebt lange Bäder.",
  price: "8,90 €",
  url: "https://seife.example/geheim-lavendel",
  imageUrl: "https://seife.example/geheim.jpg",
  shop: "Seifenmanufaktur",
}

const OWN = ownGift({ title: "Kinogutschein für zwei", code: "KINO-SECRET-4711", url: "https://kino.example/secret-voucher" })

// A calendar from 2026-12-01 (Berlin): door 1 an open note, door 2 a picked
// idea, door 3 the sender's own gift with a code, the rest notes.
function filled(): CalendarContent {
  let content = initialContent({
    templateId: "advent-classic",
    recipientName: "Anna",
    senderName: "Javier",
    startDate: "2026-12-01",
    timezone: "Europe/Berlin",
  })
  content = setDoor(content, 1, { title: "Day one", message: "The first light." })!
  content = setDoor(content, 2, { gift: giftFromOption(PICKED), title: "Hidden title two", message: "Hidden note two." })!
  if (!OWN.ok) throw new Error("own gift")
  content = setDoor(content, 3, { gift: OWN.gift, title: "Hidden title three", message: "Hidden note three." })!
  for (let day = 4; day <= 24; day++) content = setDoor(content, day, { title: `Day ${day}`, message: `Secret note ${day}.` })!
  return content
}

function record(content: CalendarContent): LetterRecord {
  return {
    id: "00000000-0000-4000-8000-000000000048",
    ownerId: "owner",
    slug: "CalDoors48",
    kind: "calendar",
    templateId: "advent-classic",
    title: "An advent calendar for Anna",
    content,
    createdAt: "2026-11-22T00:00:00Z",
    updatedAt: "2026-11-22T00:00:00Z",
  }
}

const SECRETS = [
  PICKED.title,
  PICKED.description,
  PICKED.url,
  "geheim.jpg",
  "Kinogutschein",
  "KINO-SECRET-4711",
  "https://kino.example/secret-voucher",
  "Hidden title two",
  "Hidden note three",
  "Secret note 24.",
]

describe("picked gifts behind locked doors", () => {
  it("are absent from the public view on 1 December, when only door 1 is open", () => {
    const view = toPublicView(record(filled()), new Date("2026-12-01T09:00:00Z"), { ownerPreview: false })
    if (!view || view.kind !== "calendar") throw new Error("expected a calendar")
    expect(view.content.doors.filter((d) => !d.locked).map((d) => d.day)).toEqual([1])
    expect(view.content.doors[1]).toEqual({ day: 2, locked: true, opensOn: "2026-12-02" })
    expect(view.content.doors[2]).toEqual({ day: 3, locked: true, opensOn: "2026-12-03" })
    const json = JSON.stringify(view)
    for (const secret of SECRETS) expect(json).not.toContain(secret)
  })

  it("appear once their day comes, without the shop image", () => {
    const view = toPublicView(record(filled()), new Date("2026-12-03T09:00:00Z"), { ownerPreview: false })
    if (!view || view.kind !== "calendar") throw new Error("expected a calendar")
    const door2 = view.content.doors[1]
    expect(door2.locked).toBe(false)
    if (door2.locked) return
    expect(door2.gift).toEqual({ title: PICKED.title, description: PICKED.description, url: PICKED.url, price: "8,90 €" })
    const door3 = view.content.doors[2]
    expect(!door3.locked && door3.gift?.code).toBe("KINO-SECRET-4711")
    expect(JSON.stringify(view)).not.toContain("geheim.jpg")
    expect(JSON.stringify(view)).not.toContain("Secret note 24.")
  })

  it("are all shown in the owner's preview", () => {
    const view = toPublicView(record(filled()), new Date("2026-11-22T09:00:00Z"), { ownerPreview: true })
    if (!view || view.kind !== "calendar") throw new Error("expected a calendar")
    expect(view.content.doors.every((d) => !d.locked)).toBe(true)
    expect(JSON.stringify(view)).toContain("KINO-SECRET-4711")
  })
})
