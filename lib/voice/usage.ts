// Counting voice transcriptions against the daily limits, in the
// voice_transcriptions table (supabase/migrations/0005_voice.sql).
//
// Server code only, with the service-role client: users can read their own
// rows but never write them, or they could reset their own limit. A call is
// claimed before OpenAI is asked (the claim checks the limits and inserts in
// one step), settled with the seconds OpenAI billed, or released if the call
// failed, so a failed transcription does not count.
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { MAX_RECORDING_SECONDS, VOICE_LIMITS } from "./rules"

export type ClaimRefusal = "user_count" | "user_seconds" | "site_cap"
export type Claim = { ok: true; id: string } | { ok: false; reason: ClaimRefusal }

const REFUSALS: ClaimRefusal[] = ["user_count", "user_seconds", "site_cap"]
// The column's own cap (numeric(7, 2), at most 7200).
const MAX_STORED_SECONDS = 7200

// MAJNU_DAILY_VOICE_CAP: transcriptions per UTC day for the whole site. 0 turns
// voice off; empty or invalid uses the default.
export function siteDailyCap(): number {
  const raw = process.env.MAJNU_DAILY_VOICE_CAP?.trim()
  if (!raw) return VOICE_LIMITS.siteRecordingsPerDayDefault
  const value = Number(raw)
  return Number.isInteger(value) && value >= 0 ? value : VOICE_LIMITS.siteRecordingsPerDayDefault
}

function storedSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0
  return Math.min(Math.round(seconds * 100) / 100, MAX_STORED_SECONDS)
}

// `seconds` is the length the browser reported, at most a minute; it is
// replaced by what OpenAI billed when the call is settled.
export async function claimTranscription(userId: string, seconds: number): Promise<Claim> {
  const { data, error } = await createAdminClient().rpc("claim_voice_transcription", {
    p_user_id: userId,
    p_seconds: storedSeconds(Math.min(seconds, MAX_RECORDING_SECONDS)),
    p_max_per_user: VOICE_LIMITS.recordingsPerDay,
    p_max_seconds_per_user: VOICE_LIMITS.secondsPerDay,
    p_max_per_site: siteDailyCap(),
  })
  if (error) throw new Error(`Could not claim a voice transcription: ${error.message}`)
  const row = (Array.isArray(data) ? data[0] : data) as { claim_id?: unknown; refusal?: unknown } | null | undefined
  if (row && typeof row.claim_id === "string") return { ok: true, id: row.claim_id }
  const reason = REFUSALS.find((known) => known === row?.refusal)
  if (reason) return { ok: false, reason }
  throw new Error("Could not claim a voice transcription: unexpected answer")
}

export async function settleTranscription(id: string, seconds: number): Promise<void> {
  const { error } = await createAdminClient()
    .from("voice_transcriptions")
    .update({ seconds: storedSeconds(seconds) })
    .eq("id", id)
  if (error) throw new Error(`Could not record the transcription's length: ${error.message}`)
}

export async function releaseTranscription(id: string): Promise<void> {
  const { error } = await createAdminClient().from("voice_transcriptions").delete().eq("id", id)
  if (error) throw new Error(`Could not release a failed transcription: ${error.message}`)
}
