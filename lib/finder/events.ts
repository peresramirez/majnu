// The gift finder's contract between POST /api/finder (server) and the finder
// chat on the landing page (client). The route streams one JSON FinderEvent
// per line (application/x-ndjson), always ending with `done`.
//
// Every finder request needs a Supabase session. Visitors who have not signed
// up get an invisible anonymous account first (see docs/plan.md, "Gift finder").
import type { TemplateId } from "@/lib/letters/schema"

// What the browser tells us. Country and region never come from the browser:
// the server reads them from the request (Cloudflare's network location).
export type FinderLocale = {
  language: string // navigator.language, e.g. "de-DE"
  languages?: string[] // navigator.languages
  timezone?: string // Intl.DateTimeFormat().resolvedOptions().timeZone
}

// Photos and documents (issue #77): a message with files is sent as
// multipart/form-data instead of JSON, with this request as JSON in a part
// named `request` and up to 3 parts named `file` (lib/finder/file-rules.ts
// has the types and limits). `message` may then be empty. The server reads
// each file once, keeps only short notes (FinderContext.notes) and stores no
// file. Added for issue #77 (additive).
export const FINDER_REQUEST_PART = "request"
export const FINDER_FILE_PART = "file"

export type FinderRequest = {
  // Absent on a visitor's first message; the route creates a session and sends
  // a `session` event first.
  sessionId?: string
  message: string
  locale: FinderLocale
  // Sent while the wrap step is open (issues #70 and #71): the gift and the
  // design the visitor chose. The server checks the option is one of the
  // session's last options and tells Majnu in the context block, so a message
  // such as "it's for my sister Ana" is answered in that frame. Added for
  // issue #70 (additive).
  wrap?: WrapChoice
}

export type WrapChoice = { optionId: string; templateId: WrapTemplateId }

// What Majnu assumed before searching. The UI shows it as small chips the
// visitor can correct in their next message ("She's 60, not 45").
export type FinderContext = {
  country?: string // ISO 3166-1 alpha-2, e.g. "DE"
  region?: string // e.g. "Berlin"
  language: string // the language Majnu answers and searches in, e.g. "de"
  currency?: string // ISO 4217, e.g. "EUR"
  relationship?: string // as the visitor said it: "mother", "girlfriend", "best friend"
  ageRange?: [number, number] // assumed from the relationship until the visitor says otherwise
  budget?: string // e.g. "under 50 €", only if the visitor gave one
  interests?: string[] // from the visitor or from a public profile they shared
  // As the visitor said it ("Geburtstag", "her birthday party"), only if they
  // gave one. The wrap step offers the party pop box for a birthday or a party
  // (lib/finder/wrap-templates.ts). Added for issue #59 (additive).
  occasion?: string
  // The person's name, only if the visitor gave it. The wrap step prefills
  // "Their name" with it. Added for issue #71 (additive).
  name?: string
  // Short notes from photos and documents the visitor shared ("Wishlist:
  // Kindle Paperwhite, 149,99 €"), shown as chips the visitor can correct and
  // used by the search and the wrap brief. Never the file itself. Added for
  // issue #77 (additive).
  notes?: string[]
}

export type GiftOption = {
  id: string // stable within a session, used to choose or wrap it
  title: string
  description: string // one or two sentences
  reason: string // why it suits this person
  price?: string // display price in the local currency, e.g. "39,90 €"
  url: string // https product page
  imageUrl?: string // https product image, shown in the finder only
  shop?: string // e.g. "Thalia"
}

export type FinderLimitReason =
  // Today's finder sessions (FINDER_LIMITS.sessionsPerDay) have searched and none has searches left, so
  // searching waits until tomorrow (the ideas shown can still be wrapped).
  // Also a calendar's 2 idea pools a day. Changed for issue #70.
  | "finder_daily"
  // No longer sent (issue #70: personalising has no cap of its own); kept so
  // older pages and lib/calendars/types.ts still type-check.
  | "personalise_daily"
  // This session's searches or messages (FINDER_LIMITS) are used; a new search can go on
  // while one of today's sessions is left. Added for issue #70.
  | "session_full"
  | "site_busy" // the site-wide daily cap
  // Files that were not read: this session's 6, the visitor's 12 a day, or the
  // site's daily cap on reading files. Added for issue #77 (additive).
  | "files_limit"
  | "signin_required" // e.g. an advent calendar

export type FinderEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; delta: string }
  // What Majnu is doing right now, e.g. "Looking at gifts in Germany…".
  | { type: "status"; label: string }
  | { type: "context"; context: FinderContext }
  // Three options (sometimes fewer), with the one Majnu recommends and why.
  | { type: "options"; options: GiftOption[]; recommendedId: string; why: string }
  // A personalising question; `suggestions` become answers the visitor picks
  // (issue #82: picked, not sent, until they send all their answers as one
  // message). `label` names what it asks about in a word or two ("Free
  // time"), for that message. `profileRead` says the session can read no
  // more public profiles (issue #89: its 5 reads or 8 attempts are used), so
  // the finder offers no profile field under the questions. Both added for
  // issue #82 (additive); the name is kept from when one read was the limit.
  | { type: "question"; text: string; suggestions?: string[]; label?: string; profileRead?: boolean }
  | { type: "limit"; reason: FinderLimitReason; message: string }
  | { type: "error"; message: string }
  // On the wrap step: what Majnu heard for the page (fill_wrap), filled into
  // the wrap form for the visitor to check. Never wraps by itself. Added for
  // issue #70 (additive).
  | { type: "fill"; fields: WrapFill }
  | { type: "done" }

// The wrap form's fields Majnu may fill in; only those it heard are present.
export type WrapFill = { recipientName?: string; senderName?: string; note?: string; giftCode?: string }

// Wrapping a chosen gift in a template: POST /api/finder/wrap answers JSON.
// gift-box-3d and party-box were added in issue #50, gift-3d in issue #99 (additive).
export type WrapTemplateId = Extract<TemplateId, "gift-reveal" | "classic-envelope" | "postcard" | "gift-box-3d" | "party-box" | "gift-3d">

export type WrapRequest = {
  sessionId: string
  optionId: string
  templateId: WrapTemplateId
  recipientName?: string
  senderName?: string
  note?: string // anything the sender wants to say; Majnu writes the rest
  // A voucher code, gift-card code or order details the sender got from the
  // shop, put in the page's gift as `code` and shown only once it is opened.
  // Added for issue #71 (additive).
  giftCode?: string
}

export type WrapResponse = { letterId: string; slug: string } | { error: string; reason?: FinderLimitReason }
