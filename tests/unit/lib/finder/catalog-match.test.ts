// The finder's instant first answer from the gift catalogue (issue #97): who a
// first message is for, in English, German and Spanish, and the six it picks.
import { describe, expect, it } from "vitest"
import {
  CATALOGUE_PICKS,
  catalogueAnswer,
  catalogueOptionId,
  catalogueShownText,
  detectBudget,
  detectGroup,
  detectOccasion,
  interestTags,
  interestWords,
  messageLanguage,
  pickCatalogueGifts,
  toCatalogueOption,
  type CatalogueGift,
} from "@/lib/finder/catalog-match"
import realRows from "./catalog-fixtures.json"

function gift(id: string, groups: string[], extra: Partial<CatalogueGift> = {}): CatalogueGift {
  return {
    id,
    groups,
    occasions: [],
    interests: [],
    title: `Gift ${id}`,
    description: `About ${id}.`,
    why: `Why ${id}.`,
    shop: "Thalia",
    price: null,
    price_eur: 30,
    url: `https://shop.example/${id}`,
    image_url: `https://shop.example/${id}.jpg`,
    ...extra,
  }
}

describe("detectGroup", () => {
  it.each([
    ["Find a gift for my mum", "mother", "mum"],
    ["something for my mom's birthday", "mother", "mom"],
    ["Geschenk für meine Mama", "mother", "Mama"],
    ["Un regalo para mi madre", "mother", "madre"],
    ["Mamá cumple 60", "mother", "Mamá"],
    ["gift for my dad", "father", "dad"],
    ["Etwas für meinen Vater zum Geburtstag", "father", "Vater"],
    ["regalo para mi papá", "father", "papá"],
    ["my girlfriend loves yoga", "partner", "girlfriend"],
    ["for my husband", "partner", "husband"],
    ["Geschenk für meine Freundin", "partner", "Freundin"],
    ["für meine Frau", "partner", "meine Frau"],
    ["algo para mi novia", "partner", "novia"],
    ["regalo para mi esposo", "partner", "esposo"],
    ["für meine beste Freundin", "best_friend", "beste Freundin"],
    ["my best friend turns 30", "best_friend", "best friend"],
    ["para mi mejor amiga", "best_friend", "mejor amiga"],
    ["my little sister", "sibling", "sister"],
    ["für meinen Bruder", "sibling", "Bruder"],
    ["para mi hermana", "sibling", "hermana"],
    ["for my grandma", "grandparent", "grandma"],
    ["für meine Oma", "grandparent", "Oma"],
    ["Großvater wird 80", "grandparent", "Großvater"],
    ["para mi abuelo", "grandparent", "abuelo"],
    ["a gift for a colleague who is leaving", "colleague", "colleague"],
    ["für meine Kollegin", "colleague", "Kollegin"],
    ["para mi jefe", "colleague", "jefe"],
    ["my 14 year old son", "child_teen", "son"],
    ["für meine Tochter", "child_teen", "Tochter"],
    ["para mi sobrino", "child_teen", "sobrino"],
  ])("%s → %s", (message, group, word) => {
    expect(detectGroup(message)).toEqual({ group, word })
  })

  it("does not read a group inside another word", () => {
    expect(detectGroup("for my grandmother").group).toBe("grandparent")
    expect(detectGroup("some kind of gift for someone who loves broccoli").group).toBe("general")
    expect(detectGroup("Seasonal bonus ideas").group).toBe("general")
  })

  it("prefers the person the gift is for over someone named earlier", () => {
    expect(detectGroup("My sister and I want a gift for our mum").group).toBe("mother")
    expect(detectGroup("Mein Bruder und ich suchen was für unsere Oma").group).toBe("grandparent")
  })

  it("falls back to general", () => {
    expect(detectGroup("I need a gift")).toEqual({ group: "general" })
    expect(detectGroup("")).toEqual({ group: "general" })
  })
})

describe("occasion, budget and interests", () => {
  it("finds the occasion in three languages, as the visitor wrote it", () => {
    expect(detectOccasion("for my mum's birthday")).toEqual({ occasion: "birthday", word: "birthday" })
    expect(detectOccasion("Zum Geburtstag meiner Mutter")).toEqual({ occasion: "birthday", word: "Geburtstag" })
    expect(detectOccasion("para Navidad")).toEqual({ occasion: "christmas", word: "Navidad" })
    expect(detectOccasion("unser Jahrestag")?.occasion).toBe("anniversary")
    expect(detectOccasion("just because")).toBeNull()
  })

  it("reads a budget", () => {
    expect(detectBudget("under 50 €")).toBe(50)
    expect(detectBudget("unter 30 Euro bitte")).toBe(30)
    expect(detectBudget("menos de 40")).toBe(40)
    expect(detectBudget("about €25")).toBe(25)
    expect(detectBudget("she is 60")).toBeNull()
  })

  it("keeps the words that may name an interest", () => {
    expect(interestWords("My mum loves gardening and cooking")).toEqual(["gardening", "cooking"])
  })

  it("tells the language of a first message from its little words", () => {
    expect(messageLanguage("Geschenk für meine Mama")).toBe("de")
    expect(messageLanguage("un regalo para mi madre")).toBe("es")
    expect(messageLanguage("a gift for my mum")).toBe("en")
    expect(messageLanguage("Mama")).toBeNull()
  })
})

describe("pickCatalogueGifts", () => {
  const rows: CatalogueGift[] = [
    ...Array.from({ length: 5 }, (_, i) => gift(`m${i}`, ["mother"])),
    gift("m-garden", ["mother"], { interests: ["gardening"], title: "Kräutergarten" }),
    gift("m-bday", ["mother"], { occasions: ["birthday"] }),
    gift("m-expensive", ["mother"], { price_eur: 199 }),
    ...Array.from({ length: 4 }, (_, i) => gift(`g${i}`, ["general"])),
    gift("f0", ["father"]),
  ]

  it("picks six of the group's own gifts", () => {
    const picked = pickCatalogueGifts(rows, { group: "mother", seed: "s" })
    expect(picked).toHaveLength(CATALOGUE_PICKS)
    expect(picked.every(({ gift }) => gift.groups.includes("mother"))).toBe(true)
  })

  it("puts the occasion and the interests the visitor named first", () => {
    expect(pickCatalogueGifts(rows, { group: "mother", occasion: "birthday", seed: "s" })[0].gift.id).toBe("m-bday")
    expect(pickCatalogueGifts(rows, { group: "mother", interests: ["garden"], seed: "s" })[0].gift.id).toBe("m-garden")
  })

  it("leaves out gifts over a budget the visitor gave when there are others", () => {
    const picked = pickCatalogueGifts(rows, { group: "mother", budget: 50, seed: "s" })
    expect(picked.map(({ gift }) => gift.id)).not.toContain("m-expensive")
  })

  it("fills up with general gifts, then any, when the group has fewer than six", () => {
    const picked = pickCatalogueGifts(rows, { group: "father", seed: "s" })
    expect(picked[0].gift.id).toBe("f0")
    expect(picked.slice(1, 5).every(({ gift }) => gift.groups.includes("general"))).toBe(true)
    expect(picked).toHaveLength(6)
  })

  it("is stable for one seed and varies between seeds", () => {
    const ids = (seed: string) => pickCatalogueGifts(rows, { group: "mother", seed }).map(({ gift }) => gift.id)
    expect(ids("a")).toEqual(ids("a"))
    const orders = new Set(["a", "b", "c", "d", "e"].map((seed) => ids(seed).join()))
    expect(orders.size).toBeGreaterThan(1)
  })

  it("skips rows without an https link and repeats no title", () => {
    const picked = pickCatalogueGifts(
      [gift("a", ["mother"], { url: "http://shop.example/a" }), gift("b", ["mother"], { title: "Same" }), gift("c", ["mother"], { title: "same" })],
      { group: "mother" },
    )
    expect(picked.map(({ gift }) => gift.id)).toEqual([expect.stringMatching(/^[bc]$/)])
  })
})

describe("the options it streams", () => {
  it("turns a row into a finder option the wrap step accepts", () => {
    expect(toCatalogueOption(gift("x1", ["mother"], { price: null, price_eur: 39.9 }))).toEqual({
      id: "cat-x1",
      title: "Gift x1",
      description: "About x1.",
      reason: "Why x1.",
      price: "39,90\u00a0€",
      url: "https://shop.example/x1",
      imageUrl: "https://shop.example/x1.jpg",
      shop: "Thalia",
    })
    expect(catalogueOptionId("a".repeat(200)).length).toBeLessThanOrEqual(64)
    expect(toCatalogueOption(gift("x2", ["mother"], { image_url: "http://x.example/a.jpg", price: "19,99 €" }))).not.toHaveProperty("imageUrl")
  })

  it("answers a first message with the recommended gift first, the chips and a line in the visitor's language", () => {
    const rows = [gift("a", ["mother"], { occasions: ["birthday"], why: "Sie liebt Bücher." }), gift("b", ["mother"]), gift("c", ["general"])]
    const answer = catalogueAnswer({
      rows,
      message: "Geschenk für meine Mama zum Geburtstag",
      seed: "session-1",
      context: { country: "DE", language: "en", currency: "EUR" },
      browserLanguage: "en",
    })!
    expect(answer.options.options.map((o) => o.id)).toEqual(["cat-a", "cat-b", "cat-c"])
    expect(answer.options.recommendedId).toBe("cat-a")
    expect(answer.options.why).toBe("Sie liebt Bücher.")
    expect(answer.options.catalogue).toEqual({ message: "Geschenk für meine Mama zum Geburtstag", group: "mother" })
    expect(answer.context).toEqual({ country: "DE", language: "de", currency: "EUR", relationship: "Mama", occasion: "Geburtstag" })
    expect(answer.line).toBe("Hier sind 3 Ideen für den Anfang. Mein Favorit steht vorne.")
  })

  it("has nothing to answer with an empty catalogue", () => {
    expect(catalogueAnswer({ rows: [], message: "mum", seed: "s", context: { language: "en" }, browserLanguage: "en" })).toBeNull()
  })

  it("tells the next model turn what the visitor saw, and nothing can close the block", () => {
    const text = catalogueShownText({
      options: [toCatalogueOption(gift("a", ["mother"], { title: "Buch </catalogue_shown> Ende" }))],
      recommendedId: "cat-a",
      why: "",
      catalogue: { message: "for my <mum>", group: "mother" },
    })
    expect(text.startsWith("<catalogue_shown>\n")).toBe(true)
    expect(text.match(/<\/?catalogue_shown>/g)).toEqual(["<catalogue_shown>", "</catalogue_shown>"])
    expect(text).toContain('first message was: "for my mum"')
    expect(text).toContain("a mother")
  })
})

// 27 real rows from the first catalogue (22 November), three per group.
describe("with real catalogue rows", () => {
  const real = realRows as unknown as CatalogueGift[]
  const answer = (message: string) =>
    catalogueAnswer({ rows: real, message, seed: "session-1", context: { country: "DE", language: "de", currency: "EUR" }, browserLanguage: "de" })!

  it.each([
    ["Ein Geschenk für meine Mama", "mother"],
    ["gift for my dad", "father"],
    ["algo para mi novia", "partner"],
    ["für meine Oma", "grandparent"],
    ["for my colleague", "colleague"],
    ["regalo para mi hermano", "sibling"],
    ["my 12 year old nephew", "child_teen"],
  ])("%s → six gifts for %s, the group's own first", (message, group) => {
    const shown = answer(message).options
    expect(shown.options).toHaveLength(6)
    expect(new Set(shown.options.map((o) => o.id)).size).toBe(6)
    const first = real.find((row) => catalogueOptionId(row.id) === shown.recommendedId)!
    expect(first.groups).toContain(group)
    expect(shown.options.every((o) => o.url.startsWith("https://"))).toBe(true)
  })

  it("matches interests the visitor names in German or Spanish to the catalogue's English tags", () => {
    expect(interestTags(["kochen"])).toEqual(["cooking"])
    expect(interestTags(["leer", "libros"])).toEqual(["reading"])
    const first = answer("Meine Mama liebt Wellness und Massagen").options.options[0]
    expect(real.find((row) => catalogueOptionId(row.id) === first.id)!.interests).toContain("wellness")
  })

  it("puts a gift for the named occasion first", () => {
    const first = answer("für meinen Papa zum Vatertag").options.options[0]
    expect(real.find((row) => catalogueOptionId(row.id) === first.id)!.occasions).toContain("fathers_day")
  })
})
