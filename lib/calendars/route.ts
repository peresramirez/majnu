// Shared by the calendar routes (app/api/calendars/): JSON answers that are
// never cached, and the account check every route makes first.
import "server-only"
import { calendarResult } from "@/lib/limits"
import { createClient } from "@/lib/supabase/server"
import type { CalendarError } from "./types"

export function respond(status: number, body: unknown): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } })
}

export function errorResponse(status: number, body: CalendarError): Response {
  return respond(status, body)
}

// The signed-in user, or the answer to send instead: 401 without a session,
// 403 for a guest, because calendars need a real account (lib/limits.ts).
export async function calendarUser(): Promise<{ id: string } | Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return errorResponse(401, { error: "Sign in to make a calendar.", reason: "session_required" })
  const allowed = calendarResult({ isAnonymous: user.is_anonymous === true })
  if (!allowed.ok) return errorResponse(403, { error: allowed.message, reason: "signin_required" })
  return { id: user.id }
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return undefined
  }
}

export const NOT_FOUND = "This calendar was not found."
export const INVALID = "Something in that was not right. Check it and try again."
