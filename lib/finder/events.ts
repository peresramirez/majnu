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

export type FinderRequest = {
  // Absent on a visitor's first message; the route creates a session and sends
  // a `session` event first.
  sessionId?: string
  message: string
  locale: FinderLocale
}

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
  | "finder_daily" // 3 searches a day for one visitor
  | "personalise_daily" // 2 personalised searches a day
  | "site_busy" // the site-wide daily cap
  | "signin_required" // e.g. an advent calendar

export type FinderEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; delta: string }
  // What Majnu is doing right now, e.g. "Looking at gifts in Germany…".
  | { type: "status"; label: string }
  | { type: "context"; context: FinderContext }
  // Three options (sometimes fewer), with the one Majnu recommends and why.
  | { type: "options"; options: GiftOption[]; recommendedId: string; why: string }
  // A personalising question; `suggestions` become tappable answers.
  | { type: "question"; text: string; suggestions?: string[] }
  | { type: "limit"; reason: FinderLimitReason; message: string }
  | { type: "error"; message: string }
  | { type: "done" }

// Wrapping a chosen gift in a template: POST /api/finder/wrap answers JSON.
// gift-box-3d and party-box were added in issue #50 (additive).
export type WrapTemplateId = Extract<TemplateId, "gift-reveal" | "classic-envelope" | "postcard" | "gift-box-3d" | "party-box">

export type WrapRequest = {
  sessionId: string
  optionId: string
  templateId: WrapTemplateId
  recipientName?: string
  senderName?: string
  note?: string // anything the sender wants to say; Majnu writes the rest
}

export type WrapResponse = { letterId: string; slug: string } | { error: string; reason?: FinderLimitReason }
