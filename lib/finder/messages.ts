// The few sentences the finder writes itself rather than through the model:
// limits, errors and the status line when the model gave none. Most visitors
// arrive from ads in Germany, so there is a German version; everyone else gets
// English. docs/brand.md voice: plain, kind, no exclamation marks, and say what
// to do next.
import type { FinderLimitReason } from "./events"

type Texts = {
  // Each takes the limit it reports, so the numbers live only in limits.ts.
  limits: Record<Exclude<FinderLimitReason, "signin_required"> | "sessions_daily" | "session_messages", (limit: number) => string>
  errors: { generic: string; busy: string; refusal: string; noOptions: string; saving: string }
  // Answers before a stream starts, and from the wrap route.
  requests: {
    noMessage: string
    tooLong: string
    sessionNotFound: string
    optionNotFound: string
    wrapFailed: string
    wrapRefused: string
  }
  status: string
}

const EN: Texts = {
  limits: {
    finder_daily: (n) => `You have searched for gifts ${n} times today, the most for one day. Choose one of the ideas you found, or come back tomorrow for more.`,
    personalise_daily: (n) => `You have personalised ${n} searches today, the most for one day. Choose one of the ideas you found, or start a new search.`,
    site_busy: () => "A lot of people are looking for gifts today, so new searches are paused until tomorrow. Choose one of the ideas you found, or come back tomorrow.",
    sessions_daily: () => "You have started a lot of searches today. Come back tomorrow to start another.",
    session_messages: () => "This search has had a lot of messages. Start a new search to keep going.",
  },
  errors: {
    generic: "Something went wrong looking for gifts. Try again.",
    busy: "A lot of people are looking for gifts right now. Try again in a minute.",
    refusal: "I can't help with that one. Tell me who the gift is for and I'll look for ideas.",
    noOptions: "I couldn't find gifts I'd trust for this one. Tell me a little more about them and I'll look again.",
    saving: "Something went wrong saving this search. Try again.",
  },
  requests: {
    noMessage: "Write who the gift is for first.",
    tooLong: "That message is too long. Try a shorter one.",
    sessionNotFound: "This search was not found. Start a new one.",
    optionNotFound: "That gift is no longer in this search. Choose one of the ideas shown.",
    wrapFailed: "Something went wrong wrapping the gift. Try again.",
    wrapRefused: "I can't write a page for this one. Try changing your message.",
  },
  status: "Looking for gifts…",
}

const DE: Texts = {
  limits: {
    finder_daily: (n) => `Du hast heute schon ${n}-mal nach Geschenken gesucht, mehr geht an einem Tag nicht. Wähl eine der Ideen aus, oder schau morgen wieder vorbei.`,
    personalise_daily: (n) => `Du hast heute schon ${n} Suchen persönlich angepasst, mehr geht an einem Tag nicht. Wähl eine der Ideen aus, oder starte eine neue Suche.`,
    site_busy: () => "Heute suchen sehr viele Menschen nach Geschenken, deshalb sind neue Suchen bis morgen pausiert. Wähl eine der Ideen aus, oder schau morgen wieder vorbei.",
    sessions_daily: () => "Du hast heute schon viele Suchen begonnen. Morgen kannst du eine neue starten.",
    session_messages: () => "In dieser Suche sind schon sehr viele Nachrichten. Starte eine neue Suche, um weiterzumachen.",
  },
  errors: {
    generic: "Bei der Geschenksuche ist etwas schiefgegangen. Versuch es noch einmal.",
    busy: "Gerade suchen sehr viele nach Geschenken. Versuch es in einer Minute noch einmal.",
    refusal: "Dabei kann ich nicht helfen. Erzähl mir, für wen das Geschenk ist, dann suche ich Ideen.",
    noOptions: "Dafür habe ich keine Geschenke gefunden, denen ich traue. Erzähl mir etwas mehr über die Person, dann suche ich noch einmal.",
    saving: "Beim Speichern dieser Suche ist etwas schiefgegangen. Versuch es noch einmal.",
  },
  requests: {
    noMessage: "Schreib zuerst, für wen das Geschenk ist.",
    tooLong: "Diese Nachricht ist zu lang. Versuch es kürzer.",
    sessionNotFound: "Diese Suche gibt es nicht mehr. Starte eine neue.",
    optionNotFound: "Dieses Geschenk ist nicht mehr in dieser Suche. Wähl eine der gezeigten Ideen.",
    wrapFailed: "Beim Verpacken des Geschenks ist etwas schiefgegangen. Versuch es noch einmal.",
    wrapRefused: "Für diese Nachricht kann ich keine Seite schreiben. Versuch es mit anderen Worten.",
  },
  status: "Ich suche nach Geschenken…",
}

export function textsFor(language: string | undefined): Texts {
  return language?.toLowerCase().startsWith("de") ? DE : EN
}
