// The finder's instant first answer (issue #97): who a first message is for,
// and six gifts from Majnu's own catalogue (table gift_catalog, migration
// 0014) that suit them, with no model call and no live research. Pure, so
// the matching is tested without a database; lib/finder/catalog.ts loads the
// rows (server only) and caches them.
//
// The group comes from a fast keyword match in English, German and Spanish,
// falling back to `general`. The catalogue's own group, occasion and interest
// tags are matched after the same normalising (lower case, no accents, ß as ss).
import type { FinderContext, GiftOption } from "./events"
import type { StoredOptions } from "./sessions"

export const CATALOGUE_GROUPS = [
  "mother",
  "father",
  "partner",
  "best_friend",
  "sibling",
  "grandparent",
  "colleague",
  "child_teen",
  "general",
] as const
export type CatalogueGroup = (typeof CATALOGUE_GROUPS)[number]

// One row of gift_catalog as the server reads it (the JSON the import takes
// has the same names).
export type CatalogueGift = {
  id: string
  groups: string[]
  occasions: string[]
  interests: string[]
  title: string
  description: string | null
  why: string | null
  shop: string | null
  price: string | null
  price_eur: number | null
  url: string
  image_url: string | null
}

export const CATALOGUE_PICKS = 6

export function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}

// Multi-word phrases first in each list: "beste freundin" must win over "freundin".
const GROUP_WORDS: Record<Exclude<CatalogueGroup, "general">, string[]> = {
  grandparent: [
    "grandparents", "grandmother", "grandma", "granny", "grandmom", "nana", "grandfather", "grandpa", "grandad", "granddad",
    "grosseltern", "grossmutter", "grossvater", "oma", "omi", "opa", "opi",
    "abuelos", "abuela", "abuelita", "abuelo", "abuelito",
  ],
  mother: [
    "mother in law", "mother", "mom", "mommy", "mum", "mummy", "mama", "mami", "mamma", "stepmother",
    "schwiegermutter", "mutter", "mutti", "stiefmutter",
    "madre", "mamita", "suegra", "madrastra",
  ],
  father: [
    "father in law", "father", "dad", "daddy", "papa", "papi", "pops", "stepfather",
    "schwiegervater", "vater", "vati", "stiefvater",
    "padre", "suegro", "padrastro",
  ],
  best_friend: [
    "best friend", "bestie", "bff", "friend", "friends", "buddy",
    "beste freundin", "besten freundin", "bester freund", "besten freund", "guter freund", "gute freundin", "kumpel", "kumpelin",
    "mejor amiga", "mejor amigo", "amiga", "amigo", "amigas", "amigos",
  ],
  partner: [
    "girlfriend", "boyfriend", "wife", "husband", "partner", "fiance", "fiancee", "spouse", "my love",
    "meine frau", "mein mann", "meinen mann", "ehefrau", "ehemann", "partnerin", "verlobte", "verlobten", "verlobter", "freundin", "freund", "schatz",
    "novia", "novio", "esposa", "esposo", "marido", "mi mujer", "pareja", "prometida", "prometido",
  ],
  sibling: [
    "sister", "brother", "sis", "bro", "sibling", "siblings",
    "schwester", "bruder", "geschwister",
    "hermana", "hermano", "hermanos",
  ],
  colleague: [
    "colleague", "colleagues", "coworker", "co worker", "boss", "manager", "teammate", "team", "client",
    "kollege", "kollegin", "kollegen", "chef", "chefin", "mitarbeiter", "mitarbeiterin",
    "colega", "colegas", "jefe", "jefa", "companero de trabajo", "companera de trabajo",
  ],
  child_teen: [
    "son", "daughter", "kid", "kids", "child", "children", "teen", "teenager", "nephew", "niece", "grandson", "granddaughter", "baby", "toddler",
    "sohn", "tochter", "mein kind", "unser kind", "kinder", "neffe", "nichte", "enkel", "enkelin", "enkelkind", "jugendliche", "jugendlichen",
    "hijo", "hija", "hijos", "nino", "nina", "ninos", "sobrino", "sobrina", "nieto", "nieta", "bebe", "adolescente",
  ],
}

// Words that say the gift is for the person named next: "for my mum", "für
// meine Mama", "para mi madre". A group word after one of them wins over an
// earlier one ("me and my sister want a gift for our mum").
const FOR_WORDS = /(?:^|\s)(?:for|to|fur|fuer|an|para|a)\s+(?:(?:my|our|the|a|meine[nmrs]?|mein|unsere[nmrs]?|unser|die|den|der|mi|mis|nuestra|nuestro|el|la|una|un|beste[nmrs]?|best|mejor)\s+){0,2}$/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const GROUP_PATTERNS = Object.entries(GROUP_WORDS).flatMap(([group, words]) =>
  words.map((word) => ({ group: group as CatalogueGroup, word, pattern: new RegExp(`(?<![a-z])${escapeRegExp(word).replace(/ /g, "[\\s-]+")}(?![a-z])`, "g") })),
)

export type GroupMatch = { group: CatalogueGroup; word?: string }

// Who the gift is for, from the visitor's words. `word` is what they wrote,
// for the relationship chip ("Mama"); absent for `general`.
export function detectGroup(message: string): GroupMatch {
  const text = normalise(message)
  let best: { group: CatalogueGroup; index: number; length: number; score: number } | null = null
  for (const { group, word, pattern } of GROUP_PATTERNS) {
    pattern.lastIndex = 0
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      const afterFor = FOR_WORDS.test(text.slice(Math.max(0, match.index - 40), match.index))
      // A "for" word first, then the earliest, then the longest ("beste freundin" over "freundin").
      const score = (afterFor ? 0 : 100_000) + match.index * 10 - word.length / 100
      if (!best || score < best.score) best = { group, index: match.index, length: match[0].length, score }
    }
  }
  if (!best) return { group: "general" }
  // The visitor's own spelling: normalising keeps every character but ß in place.
  const original = originalSpan(message, best.index, best.length)
  return { group: best.group, word: original }
}

// The span of the original text that normalises to text.slice(index, index + length).
function originalSpan(message: string, index: number, length: number): string {
  let start = -1
  let built = ""
  for (let i = 0; i < message.length; i++) {
    const piece = normalise(message[i])
    if (start === -1 && built.length + piece.length > index) start = i
    built += piece
    if (start !== -1 && built.length >= index + length) return message.slice(start, i + 1).trim()
  }
  return message.slice(Math.max(start, 0)).trim()
}

// Occasions, with the words that name them in the three languages. The keys
// are matched against the catalogue's occasion tags after normalising.
const OCCASION_WORDS: Record<string, string[]> = {
  birthday: ["birthday", "bday", "b-day", "geburtstag", "cumpleanos", "cumple"],
  christmas: ["christmas", "xmas", "weihnachten", "weihnacht", "navidad", "nikolaus", "advent", "reyes"],
  anniversary: ["anniversary", "jahrestag", "hochzeitstag", "aniversario"],
  valentines: ["valentine", "valentines", "valentinstag", "san valentin"],
  mothers_day: ["mothers day", "mother's day", "muttertag", "dia de la madre"],
  fathers_day: ["fathers day", "father's day", "vatertag", "dia del padre"],
  wedding: ["wedding", "hochzeit", "boda"],
  thank_you: ["thank you", "thanks", "dankeschon", "danke", "gracias", "agradecimiento"],
  graduation: ["graduation", "abschluss", "abitur", "graduacion"],
  retirement: ["retirement", "rente", "ruhestand", "jubilacion"],
  housewarming: ["housewarming", "einzug", "einweihung", "mudanza"],
  new_baby: ["new baby", "baby shower", "geburt", "nacimiento"],
  get_well: ["get well", "gute besserung", "recuperate"],
  farewell: ["farewell", "goodbye", "abschied", "despedida"],
}

const OCCASION_PATTERNS = Object.entries(OCCASION_WORDS).flatMap(([occasion, words]) =>
  words.map((word) => ({ occasion, pattern: new RegExp(`(?<![a-z])${escapeRegExp(normalise(word)).replace(/ /g, "[\\s-]*")}`) })),
)

export type OccasionMatch = { occasion: string; word: string }

export function detectOccasion(message: string): OccasionMatch | null {
  const text = normalise(message)
  let best: { occasion: string; index: number; length: number } | null = null
  for (const { occasion, pattern } of OCCASION_PATTERNS) {
    const match = pattern.exec(text)
    if (match && (!best || match.index < best.index)) best = { occasion, index: match.index, length: match[0].length }
  }
  if (!best) return null
  return { occasion: best.occasion, word: originalSpan(message, best.index, best.length) }
}

// "under 50 €", "unter 50 Euro", "menos de 50", "50€", "€30": the amount, or null.
export function detectBudget(message: string): number | null {
  const text = normalise(message)
  const capped = /(?:under|below|less than|max(?:imum)?|up to|no more than|unter|bis|hochstens|maximal|menos de|hasta|maximo)\s*(?:€|eur|euro)?\s*(\d{1,4})/.exec(text)
  if (capped) return Number(capped[1])
  const amount = /(?:€\s*(\d{1,4})|(\d{1,4})\s*(?:€|eur\b|euro))/.exec(text)
  if (amount) return Number(amount[1] ?? amount[2])
  return null
}

const STOP_WORDS = new Set(
  normalise(
    "gift gifts present idea ideas looking find something nice would like love loves loved really very with that this from what about them their they there have will want need some also into just like likes mother father birthday " +
      "geschenk geschenke suche finde etwas schones gerne liebt mochte fuer eine einen einer meine meinen meiner unsere dieser diese sehr auch noch oder aber nicht sein seine ihre ihren haben gibt " +
      "regalo regalos busco buscar algo bonito para quiero quisiera tiene mucho muy pero como esta este unos unas sobre",
  ).split(" "),
)

// The visitor's words that may name an interest ("gardening", "Kochen").
export function interestWords(message: string): string[] {
  const words = normalise(message).match(/[a-z]{4,}/g) ?? []
  const groupWords = new Set(Object.values(GROUP_WORDS).flat().map(normalise))
  return [...new Set(words.filter((word) => !STOP_WORDS.has(word) && !groupWords.has(word)))]
}

// The catalogue's interest tags, with words that name them in the three
// languages (stems: "koch" finds "Kochen" and "Kochkurs").
const INTEREST_TAGS: Record<string, string[]> = {
  cooking: ["cook", "koch", "cocin", "baking", "backen", "bake", "chef"],
  food_drink: ["food", "wine", "wein", "vino", "beer", "bier", "cerveza", "gin", "whisk", "essen", "comida", "gourmet", "feinschmeck", "schokolad", "chocolat", "foodie"],
  coffee_tea: ["coffee", "kaffee", "cafe", "espresso", "tea", "tee", "matcha"],
  reading: ["read", "book", "lesen", "lese", "buch", "bucher", "roman", "leer", "libro", "lectura", "novel"],
  writing: ["writ", "schreib", "escrib", "journal", "tagebuch", "diario", "poesie", "poetry"],
  gardening: ["garden", "garten", "jardin", "plant", "pflanz", "flower", "blume", "flor", "huerto"],
  wellness: ["wellness", "spa", "massag", "relax", "entspann", "yoga", "sauna", "beauty", "selfcare", "self care", "meditat", "bienestar"],
  travel: ["travel", "reis", "viaj", "trip", "urlaub", "vacacion", "holiday"],
  sport: ["sport", "football", "fussball", "futbol", "soccer", "gym", "fitness", "running", "laufen", "joggen", "correr", "tennis", "golf", "bike", "fahrrad", "radfahr", "cycling", "bici", "swim", "schwimm", "nadar", "ski"],
  outdoors: ["outdoor", "hiking", "wander", "senderism", "camping", "zelt", "klettern", "climb", "draussen", "montan", "berg", "mountain"],
  adventure: ["adventure", "abenteuer", "aventura", "adrenalin", "skydiv", "fallschirm", "rafting", "kart", "fahren", "driving"],
  nature: ["nature", "natur", "naturalez", "bird", "vogel", "wald", "forest"],
  animals: ["animal", "tier", "dog", "hund", "perro", "cat", "katze", "gato", "pferd", "horse", "caballo"],
  music: ["music", "musik", "musica", "concert", "konzert", "guitar", "gitarr", "piano", "klavier", "sing", "vinyl", "schallplatt"],
  culture: ["culture", "kultur", "cultura", "museum", "museo", "theater", "teatro", "art", "kunst", "arte", "opera", "kino", "cinema", "film", "movie", "pelicula"],
  photography: ["photo", "foto", "camera", "kamera", "camara"],
  games: ["game", "spiel", "juego", "puzzle", "board", "brett", "quiz", "escape", "lego"],
  gaming: ["gaming", "gamer", "videogam", "videospiel", "videojueg", "playstation", "xbox", "nintendo", "konsole", "console"],
  crafts: ["craft", "bastel", "handwerk", "manualidad", "knit", "strick", "punto", "nah", "sewing", "coser", "toepfer", "topfer", "pottery", "ceramic", "keramik", "diy", "holz", "wood", "madera"],
  science: ["science", "wissenschaft", "ciencia", "space", "weltraum", "astronom", "physik", "physic", "chemie", "tech", "technik", "tecnolog"],
  history: ["history", "geschicht", "historia", "antik", "vintage", "oldtimer"],
  home: ["home", "zuhause", "wohnung", "deko", "decor", "hogar", "casa", "interior", "einricht"],
  family: ["family", "familie", "familia", "kids", "enkel", "nieto"],
}

// The interest tags a visitor's words name.
export function interestTags(words: readonly string[]): string[] {
  const found = new Set<string>()
  for (const word of words) {
    for (const [tag, stems] of Object.entries(INTEREST_TAGS)) {
      if (stems.some((stem) => (stem.length <= 3 ? word === stem : word.startsWith(stem)))) found.add(tag)
    }
  }
  return [...found]
}

function sharesStem(a: string, b: string): boolean {
  const min = Math.min(a.length, b.length)
  if (min < 4) return a === b
  return a.startsWith(b.slice(0, Math.max(4, min - 2))) || b.startsWith(a.slice(0, Math.max(4, min - 2)))
}

export type CatalogueQuery = {
  group: CatalogueGroup
  occasion?: string | null
  interests?: string[]
  budget?: number | null
  // Varies the order among equally good gifts between sessions, stable within one.
  seed?: string
}

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function tags(values: readonly string[] | null | undefined): string[] {
  return (values ?? []).map((value) => normalise(value).replace(/[^a-z]+/g, "_").replace(/^_|_$/g, ""))
}

export type ScoredGift = { gift: CatalogueGift; score: number }

// Six gifts for the group, the best first: the group's own gifts, then the
// general ones, then any, scored up for the occasion, the interests the
// visitor named and a budget they gave.
export function pickCatalogueGifts(rows: readonly CatalogueGift[], query: CatalogueQuery, count = CATALOGUE_PICKS): ScoredGift[] {
  const occasion = query.occasion ? normalise(query.occasion).replace(/[^a-z]+/g, "_") : null
  const words = query.interests ?? []
  const wanted = interestTags(words)
  const scored = rows
    .filter((gift) => gift.url && /^https:\/\//i.test(gift.url) && gift.title)
    .map((gift) => {
      const groups = tags(gift.groups)
      let score = groups.includes(query.group) ? 10 : groups.includes("general") ? 5 : 0
      if (occasion && tags(gift.occasions).some((tag) => tag === occasion || tag.includes(occasion) || occasion.includes(tag))) score += 3
      const giftWords = [...tags(gift.interests).flatMap((tag) => tag.split("_")), ...(normalise(gift.title).match(/[a-z]{4,}/g) ?? [])]
      const giftTags = tags(gift.interests)
      const hits =
        wanted.filter((tag) => giftTags.includes(tag)).length +
        words.filter((word) => giftWords.some((giftWord) => sharesStem(word, giftWord))).length
      score += Math.min(hits, 2) * 2
      if (query.budget && gift.price_eur !== null && gift.price_eur !== undefined) score += gift.price_eur <= query.budget * 1.1 ? 1 : -4
      return { gift, score, tie: hash(`${query.seed ?? ""}:${gift.id}`) }
    })
  scored.sort((a, b) => b.score - a.score || a.tie - b.tie)
  // One gift per shop and title only once: the visitor sees six different ideas.
  const seen = new Set<string>()
  const picked: ScoredGift[] = []
  for (const entry of scored) {
    const key = normalise(entry.gift.title)
    if (seen.has(key)) continue
    seen.add(key)
    picked.push({ gift: entry.gift, score: entry.score })
    if (picked.length === count) break
  }
  return picked
}

function displayPrice(gift: CatalogueGift): string | undefined {
  if (gift.price?.trim()) return gift.price.trim()
  if (typeof gift.price_eur === "number" && Number.isFinite(gift.price_eur)) {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(gift.price_eur)
  }
  return undefined
}

// An option id the wrap step accepts (at most 64 characters, see the route).
export function catalogueOptionId(id: string): string {
  return `cat-${id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 56)}`
}

export function toCatalogueOption(gift: CatalogueGift): GiftOption {
  const price = displayPrice(gift)
  const description = gift.description?.trim() || gift.why?.trim() || gift.title
  return {
    id: catalogueOptionId(gift.id),
    title: gift.title.trim(),
    description,
    reason: gift.why?.trim() || description,
    ...(price ? { price } : {}),
    url: gift.url,
    ...(gift.image_url && /^https:\/\//i.test(gift.image_url) ? { imageUrl: gift.image_url } : {}),
    ...(gift.shop?.trim() ? { shop: gift.shop.trim() } : {}),
  }
}

// What a first message asks for, as the catalogue understands it.
export function catalogueQuery(message: string, seed: string): CatalogueQuery & { match: GroupMatch; occasionMatch: OccasionMatch | null } {
  const match = detectGroup(message)
  const occasionMatch = detectOccasion(message)
  return {
    match,
    occasionMatch,
    group: match.group,
    occasion: occasionMatch?.occasion ?? null,
    interests: interestWords(message),
    budget: detectBudget(message),
    seed,
  }
}

// The language of a short first message, from its little words, or null when
// it does not say; the finder then answers in the browser language.
export function messageLanguage(message: string): "en" | "de" | "es" | null {
  const words = normalise(message).match(/[a-z]+/g) ?? []
  const counts = { en: 0, de: 0, es: 0 }
  const lists = {
    en: new Set(["for", "my", "the", "gift", "and", "her", "his", "she", "he", "loves", "who", "is", "a", "to", "our", "best", "something"]),
    de: new Set(["fur", "fuer", "meine", "meinen", "mein", "geschenk", "und", "die", "der", "sie", "er", "liebt", "ist", "ein", "eine", "unsere", "etwas", "zum", "ich", "suche"]),
    es: new Set(["para", "mi", "regalo", "y", "el", "la", "ella", "le", "gusta", "es", "un", "una", "nuestra", "algo", "busco", "mis", "cumpleanos"]),
  }
  for (const word of words) for (const language of ["en", "de", "es"] as const) if (lists[language].has(word)) counts[language] += 1
  const best = (Object.entries(counts) as [keyof typeof counts, number][]).sort((a, b) => b[1] - a[1])[0]
  return best[1] > 0 && Object.values(counts).filter((n) => n === best[1]).length === 1 ? best[0] : null
}

const LINES: Record<"en" | "de" | "es", (count: number) => string> = {
  en: (count) => `Here are ${count === 6 ? "six" : count} ideas to start with. My favourite is first.`,
  de: (count) => `Hier sind ${count === 6 ? "sechs" : count} Ideen für den Anfang. Mein Favorit steht vorne.`,
  es: (count) => `Aquí tienes ${count === 6 ? "seis" : count} ideas para empezar. Mi favorita va primero.`,
}

// Majnu's short line above the catalogue's cards.
export function catalogueLine(language: string, count: number): string {
  const key = (["en", "de", "es"] as const).find((l) => l === language) ?? "en"
  return LINES[key](count)
}

// The marker a session keeps with the catalogue's options until the next
// model turn has heard about them (StoredOptions.catalogue).
export type CatalogueMarker = { message: string; group: CatalogueGroup; startedOver?: boolean }

export type CatalogueAnswer = {
  options: StoredOptions
  context: FinderContext
  line: string
  language: string
}

// The whole instant answer, or null when the catalogue has nothing to show.
export function catalogueAnswer(opts: {
  rows: readonly CatalogueGift[]
  message: string
  seed: string
  context: FinderContext
  browserLanguage: string
  startedOver?: boolean
}): CatalogueAnswer | null {
  const query = catalogueQuery(opts.message, opts.seed)
  const picked = pickCatalogueGifts(opts.rows, query)
  if (picked.length === 0) return null
  const options = picked.map(({ gift }) => toCatalogueOption(gift))
  const recommended = picked[0].gift
  const language = messageLanguage(opts.message) ?? opts.browserLanguage
  // The chips show who it is for and the occasion, as the visitor wrote them.
  const context: FinderContext = {
    ...opts.context,
    language,
    ...(query.match.word ? { relationship: query.match.word } : {}),
    ...(query.occasionMatch ? { occasion: query.occasionMatch.word } : {}),
    // What they love, as the catalogue understood it ("cooking"): a chip the
    // visitor can correct, and part of the personalisation score.
    ...(interestTags(query.interests ?? []).length ? { interests: interestTags(query.interests ?? []).map((tag) => tag.replace(/_/g, " ")) } : {}),
  }
  return {
    options: {
      options,
      recommendedId: options[0].id,
      why: recommended.why?.trim() || options[0].reason,
      catalogue: { message: opts.message.slice(0, 2000), group: query.group, ...(opts.startedOver ? { startedOver: true } : {}) },
    },
    context,
    line: catalogueLine(language, options.length),
    language,
  }
}

const GROUP_PHRASES: Record<CatalogueGroup, string> = {
  mother: "a mother",
  father: "a father",
  partner: "a partner",
  best_friend: "a friend",
  sibling: "a sister or brother",
  grandparent: "a grandparent",
  colleague: "a colleague",
  child_teen: "a child or teenager",
  general: "anyone (the app could not tell who it is for)",
}

// What the next model turn hears about the instant answer, in the visitor's
// message after the context block. The first message and the titles came from
// the visitor and from shops, so angle brackets are taken out: they cannot
// close the block.
export function catalogueShownText(shown: StoredOptions & { catalogue: CatalogueMarker }): string {
  const clean = (text: string) => text.replace(/[<>]/g, "").trim()
  const ideas = shown.options.map(({ id, title, price, shop }) => ({ id, title: clean(title), ...(price ? { price } : {}), ...(shop ? { shop: clean(shop) } : {}) }))
  return [
    "<catalogue_shown>",
    `The visitor's first message was: "${clean(shown.catalogue.message)}"`,
    `The app answered it at once, without you, with ${ideas.length} ready ideas from Majnu's own catalogue of gifts for ${GROUP_PHRASES[shown.catalogue.group]}, the first one recommended: ${JSON.stringify(ideas)}`,
    `The visitor sees them as cards they can choose and wrap, with "Want ideas made just for them?" and a "Personalise the gift" button under them. The message after this block is their next one. Don't list the catalogue's ideas again.`,
    "</catalogue_shown>",
  ].join("\n")
}
