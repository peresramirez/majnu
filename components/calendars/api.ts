// The calendar editor's calls to its routes (lib/calendars/types.ts). Each
// answers either the data or an error sentence to show the sender.
import type {
  CalendarError,
  CalendarSetupRequest,
  CreateCalendarResponse,
  DoorRequest,
  DoorResponse,
  NotesResponse,
  PoolRequest,
  PoolResponse,
} from "@/lib/calendars/types"

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; reason?: CalendarError["reason"]; status: number }

const OFFLINE = "The connection dropped. Check you are online and try again."

async function call<T>(url: string, method: "POST" | "PUT", body?: unknown): Promise<ApiResult<Exclude<T, CalendarError>>> {
  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    return { ok: false, error: OFFLINE, status: 0 }
  }
  let json: unknown
  try {
    json = await response.json()
  } catch {
    return { ok: false, error: "Something went wrong. Try again.", status: response.status }
  }
  if (!response.ok || (json && typeof json === "object" && "error" in json)) {
    const error = json as Partial<CalendarError>
    return { ok: false, error: error.error || "Something went wrong. Try again.", reason: error.reason, status: response.status }
  }
  return { ok: true, data: json as Exclude<T, CalendarError> }
}

export function createCalendar(body: CalendarSetupRequest) {
  return call<CreateCalendarResponse>("/api/calendars", "POST", body)
}

export function findIdeas(letterId: string, body: PoolRequest = {}) {
  return call<PoolResponse>(`/api/calendars/${letterId}/pool`, "POST", body)
}

export function saveDoor(letterId: string, day: number, body: DoorRequest) {
  return call<DoorResponse>(`/api/calendars/${letterId}/doors/${day}`, "PUT", body)
}

export function writeNotes(letterId: string) {
  return call<NotesResponse>(`/api/calendars/${letterId}/notes`, "POST")
}
