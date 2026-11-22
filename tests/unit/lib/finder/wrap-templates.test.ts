import { describe, expect, it } from "vitest"
import { WRAP_TEMPLATES } from "@/components/finder/finder-state"
import { WRAP_ORDER, isPartyOccasion, wrapTemplatesFor } from "@/lib/finder/wrap-templates"

describe("isPartyOccasion (issue #59)", () => {
  it.each([
    "birthday",
    "Her 30th Birthday",
    "bday",
    "b-day",
    "a surprise party",
    "to celebrate her new job",
    "Geburtstag",
    "Kindergeburtstag",
    "Überraschungsparty",
    "Geburtstagsfeier",
    "ein Fest",
    "anniversaire",
    "cumpleaños",
    "mi cumple",
    "una fiesta",
    "compleanno",
    "aniversário",
    "festa di laurea",
    "fête",
    "verjaardag",
    "een feestje",
    "urodziny",
    "przyjęcie",
    "doğum günü",
    "födelsedag",
    "fødselsdag",
    "bursdag",
    "день рождения",
    "вечеринка",
    "عيد ميلاد",
  ])("hears a birthday or a party in %s", (occasion) => {
    expect(isPartyOccasion(occasion)).toBe(true)
  })

  it.each([
    "Weihnachten",
    "Christmas",
    "Mother's Day",
    "Muttertag",
    "anniversary",
    "Valentinstag",
    "just because",
    "thank you",
    "Feiertag",
    "zum Feierabend",
    "Trauerfeier",
    "a celebration of life",
    "fête des mères",
    "festa della mamma",
    "felices fiestas",
    "kerstfeest",
    "Weihnachtsfest",
    "",
  ])("hears no party in %j", (occasion) => {
    expect(isPartyOccasion(occasion)).toBe(false)
  })

  it("hears no party without an occasion", () => {
    expect(isPartyOccasion(undefined)).toBe(false)
    expect(isPartyOccasion(null)).toBe(false)
  })
})

describe("wrapTemplatesFor", () => {
  it("offers the party pop box for a birthday or a party, after the 3D gift box", () => {
    expect(wrapTemplatesFor({ occasion: "Geburtstag" })).toEqual(["gift-reveal", "gift-box-3d", "party-box", "classic-envelope", "postcard"])
    expect(wrapTemplatesFor({ occasion: "her birthday party" })).toContain("party-box")
  })

  it("offers every other template, the 3D gift box included, for any gift", () => {
    const plain = ["gift-reveal", "gift-box-3d", "classic-envelope", "postcard"]
    expect(wrapTemplatesFor({ occasion: "Weihnachten" })).toEqual(plain)
    expect(wrapTemplatesFor({})).toEqual(plain)
    expect(wrapTemplatesFor(null)).toEqual(plain)
  })

  it("starts with the gift reveal, the template the wrap step chooses first", () => {
    expect(wrapTemplatesFor(null)[0]).toBe(WRAP_TEMPLATES[0])
    expect(wrapTemplatesFor({ occasion: "birthday" })[0]).toBe(WRAP_TEMPLATES[0])
  })

  // wrap.test.ts checks that the route accepts the same five ids.
  it("is the finder's order", () => {
    expect(WRAP_TEMPLATES).toEqual(WRAP_ORDER)
  })
})
