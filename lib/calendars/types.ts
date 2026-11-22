// The contract between the calendar editor (components/calendars/) and its
// routes (app/api/calendars/). Types only, so the browser and the server can
// both import it.
//
//   POST /api/calendars                 CalendarSetupRequest -> CreateCalendarResponse
//   POST /api/calendars/<id>/pool       PoolRequest          -> PoolResponse
//   PUT  /api/calendars/<id>/doors/<n>  DoorRequest          -> DoorResponse
//   POST /api/calendars/<id>/notes      (no body)            -> NotesResponse
//
// Errors answer { error, reason? } with a sentence for the sender in `error`.
import type { FinderLocale, GiftOption } from "@/lib/finder/events"
import type { CalendarContent, CalendarDoor, CalendarTemplateId } from "@/lib/letters/schema"
import type { Progress } from "./doors"

// The finder's relationship kinds (lib/finder/context.ts), repeated here as a
// type so the browser never imports that server-only module.
export type CalendarRelationshipKind = "partner" | "parent" | "grandparent" | "sibling" | "friend" | "child" | "colleague" | "other"

export type CalendarSetupRequest = {
  templateId: CalendarTemplateId
  // countdown only: 1 to 31
  days?: number
  recipientName: string
  senderName: string
  // Who they are to the sender, in the sender's words: "my girlfriend".
  relationship: string
  kind: CalendarRelationshipKind
  ageMin?: number
  ageMax?: number
  interests: string[]
  about?: string
  // A public Instagram or TikTok profile, or a public page about them.
  profileLink?: string
  // What one door may cost, as the sender says it: "under 10 €".
  doorBudget: string
  // A bigger budget for the last door, e.g. "up to 50 €".
  lastDoorBudget?: string
  // The day door 1 opens, YYYY-MM-DD.
  startDate: string
  // The recipient's IANA timezone.
  timezone: string
  locale: FinderLocale
}

export type CalendarErrorReason =
  | "session_required"
  | "signin_required"
  | "daily_letters"
  | "finder_daily"
  | "personalise_daily"
  | "site_busy"
  | "notes_daily"
  | "not_found"
  | "invalid"
  | "failed"

export type CalendarError = { error: string; reason?: CalendarErrorReason }

export type CreateCalendarResponse = { letterId: string; slug: string } | CalendarError

// Without `similarTo`: a new pool for the whole calendar (replaces the last
// one). With it: "more like this", a few ideas added to the pool.
export type PoolRequest = { similarTo?: string }

export type PoolResponse =
  | {
      pool: GiftOption[]
      // The idea Majnu suggests for the last door, if any.
      lastDoorId: string | null
      added: number
    }
  | CalendarError

export type DoorGiftChoice =
  | { type: "idea"; optionId: string }
  | { type: "own"; title: string; description?: string; url?: string; price?: string; code?: string }
  // Keep the gift already behind the door and change only the note.
  | { type: "keep" }

// `gift: null` leaves no gift behind the door: a note only, or, with an empty
// note too, an empty door again.
export type DoorRequest = { gift: DoorGiftChoice | null; title: string; message: string }

export type DoorResponse = { door: CalendarDoor; progress: Progress } | CalendarError

export type NotesResponse = { content: CalendarContent; written: number; progress: Progress } | CalendarError

// What the editor page hands the editor.
export type CalendarEditorData = {
  letterId: string
  slug: string
  templateId: CalendarTemplateId
  content: CalendarContent
  pool: GiftOption[]
  lastDoorId: string | null
  setup: {
    relationship: string
    doorBudget: string
    lastDoorBudget?: string
    country?: string
  }
}
