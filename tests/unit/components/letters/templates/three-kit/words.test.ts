// The words the issue #99 scenes draw on their textures. The scenes never
// draw a gift code: the code shows on the page only once the gift is open.
import { describe, expect, it } from "vitest"
import { parseEventStart } from "@/components/letters/event-time"
import { tinWords } from "@/components/letters/templates/gift-3d/words"
import { ticketWords } from "@/components/letters/templates/party-invite-3d/words"
import { inviteWords } from "@/components/letters/templates/wedding-invite-3d/words"
import { letterFixtures } from "@/lib/letters/fixtures"

const withCode = <T extends keyof typeof letterFixtures>(id: T) => ({
  ...letterFixtures[id],
  gifts: [{ title: "Spa day", code: "SECRET-CODE-123", url: "https://example.com/r", price: "€40" }],
})

describe("inviteWords", () => {
  it("prints the couple, the date and the place", () => {
    const c = letterFixtures["wedding-invite-3d"]
    const w = inviteWords(c, parseEventStart(c.event?.startsAt))
    expect(w.names).toBe("Mira & Daniel")
    expect(w.forName).toBe("For Hannah")
    expect(w.weekday).toBe("Saturday")
    expect(w.date).toBe("18 September 2027")
    expect(w.time).toBe("at 3:30 pm")
    expect(w.place).toBe("Weingut Knipser")
  })

  it("leaves the date out when there is no event", () => {
    const { event: _event, ...c } = letterFixtures["wedding-invite-3d"]
    const w = inviteWords(c, null)
    expect(w.date).toBe("")
    expect(w.place).toBe("")
  })

  it("never carries a gift code", () => {
    const c = withCode("wedding-invite-3d")
    expect(JSON.stringify(inviteWords(c, parseEventStart(c.event?.startsAt)))).not.toContain("SECRET-CODE-123")
  })
})

describe("ticketWords", () => {
  it("prints who it is for, when and where", () => {
    const c = letterFixtures["party-invite-3d"]
    const w = ticketWords(c, parseEventStart(c.event?.startsAt))
    expect(w.forName).toBe("For Lukas")
    expect(w.title).toBe("Jonas turns 30")
    expect(w.weekday).toBe("Saturday")
    expect(w.date).toBe("10 April")
    expect(w.time).toBe("8 pm")
    expect(w.number).toMatch(/^No\. \d{4}$/)
  })

  it("is a plain ticket without an event", () => {
    const { event: _event, ...c } = letterFixtures["party-invite-3d"]
    const w = ticketWords(c, null)
    expect(w.number).toBe("Admit one")
    expect(w.date).toBe("")
  })

  it("never carries a gift code", () => {
    const c = withCode("party-invite-3d")
    expect(JSON.stringify(ticketWords(c, parseEventStart(c.event?.startsAt)))).not.toContain("SECRET-CODE-123")
  })
})

describe("tinWords", () => {
  it("names the gift and its price, for the card inside", () => {
    const w = tinWords(letterFixtures["gift-3d"])
    expect(w.forName).toBe("For Elif")
    expect(w.giftTitle).toBe("Breakfast for two at Café Kranzler")
    expect(w.price).toBe("€58")
    expect(w.eyebrow).toBe("A gift for you")
  })

  it("counts several gifts and falls back to the headline without one", () => {
    const two = { ...letterFixtures["gift-3d"], gifts: [{ title: "A" }, { title: "B" }] }
    expect(tinWords(two).eyebrow).toBe("2 gifts inside")
    const none = { ...letterFixtures["gift-3d"], gifts: [] }
    expect(tinWords(none).giftTitle).toBe(letterFixtures["gift-3d"].headline)
  })

  it("never carries a gift code", () => {
    expect(JSON.stringify(tinWords(withCode("gift-3d")))).not.toContain("SECRET-CODE-123")
  })
})
