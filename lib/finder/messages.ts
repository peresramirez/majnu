// The few sentences the finder writes itself rather than through the model:
// limits, errors and the status line when the model gave none. Most visitors
// arrive from ads in Germany, so there is a German version; everyone else gets
// English. docs/brand.md voice: plain, kind, no exclamation marks, and say what
// to do next.
import type { FinderLimitReason } from "./events"

type Texts = {
  // Each takes the limit it reports, so the numbers live only in limits.ts.
  limits: Record<
    Exclude<FinderLimitReason, "signin_required" | "personalise_daily" | "session_full" | "files_limit"> | "session_searches" | "session_messages" | "calendar_searches" | "sessions_daily",
    (limit: number) => string
  >
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
  // The status line while a public profile is read, when the model gave none.
  profileStatus: string
  // Photos and documents (issue #77). `name` is the file's name as the
  // visitor's browser sent it, cleaned (displayFileName in file-rules.ts).
  files: {
    // While the files are read, by how many and of what kind.
    reading: (count: number, onlyImages: boolean) => string
    // Refused before anything is read (400, 413 or 415).
    tooMany: (max: number) => string
    tooBigTogether: string
    type: (name: string) => string
    empty: (name: string) => string
    imageTooBig: (name: string, mb: number) => string
    pdfTooBig: (name: string, mb: number) => string
    textTooBig: (name: string, kb: number) => string
    pdfPages: (name: string, pages: number) => string
    pdfLocked: (name: string) => string
    pdfUnreadable: (name: string) => string
    // Limits, as `files_limit` notices; the files over them are not read.
    session: (limit: number) => string
    daily: (limit: number) => string
    site: string
    // Every file of a message without words failed to be read.
    failed: string
  }
}

const EN: Texts = {
  limits: {
    finder_daily: (n) => `You have used today's ${n} gift searches. Choose one of the ideas you found, or come back tomorrow for more.`,
    session_searches: (n) => `This search has looked for gifts ${n} times, the most for one search. Choose one of the ideas, or start a new search to keep looking.`,
    session_messages: () => "This search has had a lot of messages. Choose one of the ideas, or start a new search to keep going.",
    calendar_searches: (n) => `You have looked for ideas for this calendar ${n} times. Fill the doors with the ideas you have, or add your own.`,
    site_busy: () => "A lot of people are looking for gifts today, so new searches are paused until tomorrow. Choose one of the ideas you found, or come back tomorrow.",
    sessions_daily: () => "You have started a lot of searches today. Come back tomorrow to start another.",
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
  profileStatus: "Looking at their public profile…",
  files: {
    reading: (count, onlyImages) =>
      onlyImages ? (count === 1 ? "Looking at your photo…" : "Looking at your photos…") : count === 1 ? "Reading your file…" : "Reading your files…",
    tooMany: (max) => `Share up to ${max} files in one message.`,
    tooBigTogether: "These files are too large together. Share fewer at once.",
    type: (name) => `${name || "This file"} isn't a photo, PDF or text file. Majnu can read JPEG, PNG, WebP and GIF photos, PDFs and plain text.`,
    empty: (name) => `${name || "This file"} is empty.`,
    imageTooBig: (name, mb) => `${name || "This photo"} is too large. Photos can be up to ${mb} MB.`,
    pdfTooBig: (name, mb) => `${name || "This PDF"} is too large. PDFs can be up to ${mb} MB.`,
    textTooBig: (name, kb) => `${name || "This text file"} is too long. Text files can be up to ${kb} KB.`,
    pdfPages: (name, pages) => `${name || "This PDF"} has more than ${pages} pages. Share a shorter one, or a screenshot of the page that matters.`,
    pdfLocked: (name) => `${name || "This PDF"} is protected with a password, so Majnu can't read it.`,
    pdfUnreadable: (name) => `Majnu couldn't read ${name || "this PDF"}. Try another one, or a screenshot of the page.`,
    session: (n) => `Majnu has read the ${n} files one search can take. Tell Majnu about the others in words, or start a new search.`,
    daily: (n) => `You have shared ${n} files today, the most for one day. Tell Majnu about the others in words, or come back tomorrow.`,
    site: "A lot of people are sharing files today, so Majnu can't read more until tomorrow. Tell Majnu about them in words instead.",
    failed: "I couldn't read that. Try again, or tell me about them in words.",
  },
}

const DE: Texts = {
  limits: {
    finder_daily: (n) => `Du hast deine ${n} Geschenksuchen für heute genutzt. Wähl eine der Ideen aus, oder schau morgen wieder vorbei.`,
    session_searches: (n) => `In dieser Suche hast du schon ${n}-mal nach Geschenken gesucht, mehr geht in einer Suche nicht. Wähl eine der Ideen aus, oder starte eine neue Suche.`,
    session_messages: () => "In dieser Suche sind schon sehr viele Nachrichten. Wähl eine der Ideen aus, oder starte eine neue Suche, um weiterzumachen.",
    calendar_searches: (n) => `Du hast für diesen Kalender schon ${n}-mal Ideen gesucht. Füll die Türchen mit den Ideen, die du hast, oder mit eigenen Geschenken.`,
    site_busy: () => "Heute suchen sehr viele Menschen nach Geschenken, deshalb sind neue Suchen bis morgen pausiert. Wähl eine der Ideen aus, oder schau morgen wieder vorbei.",
    sessions_daily: () => "Du hast heute schon viele Suchen begonnen. Morgen kannst du eine neue starten.",
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
  profileStatus: "Ich schaue mir das öffentliche Profil an…",
  files: {
    reading: (count, onlyImages) =>
      onlyImages ? (count === 1 ? "Ich schaue mir dein Foto an…" : "Ich schaue mir deine Fotos an…") : count === 1 ? "Ich lese deine Datei…" : "Ich lese deine Dateien…",
    tooMany: (max) => `Teile höchstens ${max} Dateien in einer Nachricht.`,
    tooBigTogether: "Diese Dateien sind zusammen zu groß. Teile weniger auf einmal.",
    type: (name) => `${name || "Diese Datei"} ist kein Foto, kein PDF und keine Textdatei. Majnu kann JPEG-, PNG-, WebP- und GIF-Fotos, PDFs und einfachen Text lesen.`,
    empty: (name) => `${name || "Diese Datei"} ist leer.`,
    imageTooBig: (name, mb) => `${name || "Dieses Foto"} ist zu groß. Fotos dürfen bis zu ${mb} MB haben.`,
    pdfTooBig: (name, mb) => `${name || "Dieses PDF"} ist zu groß. PDFs dürfen bis zu ${mb} MB haben.`,
    textTooBig: (name, kb) => `${name || "Diese Textdatei"} ist zu lang. Textdateien dürfen bis zu ${kb} KB haben.`,
    pdfPages: (name, pages) => `${name || "Dieses PDF"} hat mehr als ${pages} Seiten. Teile ein kürzeres oder einen Screenshot der wichtigen Seite.`,
    pdfLocked: (name) => `${name || "Dieses PDF"} ist mit einem Passwort geschützt, deshalb kann Majnu es nicht lesen.`,
    pdfUnreadable: (name) => `Majnu konnte ${name || "dieses PDF"} nicht lesen. Versuch ein anderes oder einen Screenshot der Seite.`,
    session: (n) => `Majnu hat die ${n} Dateien gelesen, die in eine Suche passen. Erzähl Majnu von den anderen, oder starte eine neue Suche.`,
    daily: (n) => `Du hast heute schon ${n} Dateien geteilt, mehr geht an einem Tag nicht. Erzähl Majnu von den anderen, oder schau morgen wieder vorbei.`,
    site: "Heute teilen sehr viele Menschen Dateien, deshalb kann Majnu bis morgen keine weiteren lesen. Erzähl Majnu stattdessen davon.",
    failed: "Das konnte ich nicht lesen. Versuch es noch einmal, oder erzähl mir davon.",
  },
}

export function textsFor(language: string | undefined): Texts {
  return language?.toLowerCase().startsWith("de") ? DE : EN
}
