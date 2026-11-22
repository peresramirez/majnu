// The signed-in owner's open events, for the Tracker tab (issue #49).
//
// Read with the user's own session, so row-level security returns only events
// of letters they own. The columns are exactly what owners are granted
// (0009_open_details.sql): the visitor hash and the user agent are not, and
// asking for them would fail.
import "server-only"
import { createClient } from "@/lib/supabase/server"
import type { DeviceType } from "./details"
import type { OpenEventType } from "./rules"

export type TrackedEvent = {
  id: number
  letterId: string
  type: OpenEventType
  // The calendar door, or 0.
  day: number
  country: string | null
  city: string | null
  language: string | null
  device: DeviceType | null
  at: string
}

const EVENT_COLUMNS = "id, letter_id, type, day, country, city, language, device, created_at"

// Newest first. One owner with this many events has more than a page can
// show; the summary counts on each gift still come from letter_summaries.
export const MAX_TRACKED_EVENTS = 1000

type EventRow = {
  id: number
  letter_id: string
  type: string
  day: number
  country: string | null
  city: string | null
  language: string | null
  device: string | null
  created_at: string
}

const TYPES = new Set<string>(["open", "door_open", "gift_click"])
const DEVICES = new Set<string>(["phone", "tablet", "desktop"])

export function toTrackedEvent(row: EventRow): TrackedEvent | null {
  if (!TYPES.has(row.type)) return null
  return {
    id: Number(row.id),
    letterId: row.letter_id,
    type: row.type as OpenEventType,
    day: Number(row.day) || 0,
    country: row.country,
    city: row.city,
    language: row.language,
    device: row.device && DEVICES.has(row.device) ? (row.device as DeviceType) : null,
    at: row.created_at,
  }
}

export async function listMyOpenEvents(): Promise<TrackedEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("letter_events")
    .select(EVENT_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MAX_TRACKED_EVENTS)
    .returns<EventRow[]>()
  if (error) throw new Error(`Could not load when your gifts were opened: ${error.message}`)
  return (data ?? []).map(toTrackedEvent).filter((event): event is TrackedEvent => event !== null)
}
