// The spending guard for every route that calls the model, and the one rule
// that is not about money: calendars need a real account.
//
// There are no plans to gate on any more (docs/business-plan.md): finding,
// letters, invitations, gift research and calendars are free. The only paid
// thing, a personalised wrapper, is bought per gift in Checkout
// (lib/billing/service.ts) and never unlocks a feature.
//
// Counts go through the signed-in user's client, so row-level security limits
// them to that user's own letters. Without a session the queries fail and the
// functions throw.
import "server-only"
import type { LimitReason } from "@/lib/agents/events"
import { createClient } from "@/lib/supabase/server"

// Raised from 5 and 40 by the developer on 22 November, so no one testing or
// using Majnu runs into them; they stay as a guard against a script.
export const LIMITS = {
  lettersPerDay: 100,
  chatTurnsPerLetter: 200,
} as const

export type LimitResult = { ok: true } | { ok: false; reason: LimitReason; message: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// May the signed-in user start another letter today (UTC day)?
export async function canCreateLetter(): Promise<LimitResult> {
  const supabase = await createClient()
  const { count, error } = await supabase
    .from("letters")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfUtcDay(new Date()).toISOString())
  if (error) throw new Error(`Could not count today's letters: ${error.message}`)
  return dailyLettersResult(count ?? 0)
}

// May the signed-in user send another message in this letter's chat?
// Throws if the letter does not exist or belongs to someone else.
export async function canSendChatTurn(letterId: string): Promise<LimitResult> {
  if (!UUID.test(letterId)) throw new Error("Letter not found")
  const supabase = await createClient()
  const { data, error } = await supabase.from("letters").select("chat").eq("id", letterId).maybeSingle()
  if (error) throw new Error(`Could not load the chat: ${error.message}`)
  if (!data) throw new Error("Letter not found")
  return chatTurnsResult(countChatTurns(Array.isArray(data.chat) ? data.chat : []))
}

// May the signed-in user use this feature? The agent's tools ask before a
// build (lib/agents/tools.ts). Gift research and new gifts are open to
// everyone; the spending guard above bounds what they cost.
//
// Calendars need a real account: a guest (anonymous account) is asked to sign
// up first, because a calendar is opened over days and a guest account lives
// in one browser.
export async function canUseFeature(feature: "calendar" | "research" | "new_gift"): Promise<LimitResult> {
  if (feature !== "calendar") return { ok: true }
  const supabase = await createClient()
  // getUser() asks Supabase Auth, so a guest who just signed up counts as a
  // real user even before their token is refreshed.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return calendarResult(user ? { isAnonymous: user.is_anonymous === true } : null)
}

// ---------- Pure helpers (unit-tested) ----------

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

// The number of messages the sender typed in a stored conversation (Anthropic
// message format). Tool results also travel as user messages; they are not turns.
export function countChatTurns(chat: unknown[]): number {
  return chat.filter(isSenderMessage).length
}

function isSenderMessage(message: unknown): boolean {
  if (!message || typeof message !== "object") return false
  const { role, content } = message as { role?: unknown; content?: unknown }
  if (role !== "user") return false
  if (typeof content === "string") return true
  if (!Array.isArray(content)) return false
  const types = content.map((block) => (block && typeof block === "object" ? (block as { type?: unknown }).type : undefined))
  return types.includes("text") && !types.includes("tool_result")
}

export function dailyLettersResult(lettersToday: number): LimitResult {
  if (lettersToday < LIMITS.lettersPerDay) return { ok: true }
  return {
    ok: false,
    reason: "daily_letters",
    message: `You have started ${LIMITS.lettersPerDay} gifts today, the most for one day. You can start another tomorrow.`,
  }
}

export function chatTurnsResult(turns: number): LimitResult {
  if (turns < LIMITS.chatTurnsPerLetter) return { ok: true }
  return {
    ok: false,
    reason: "chat_turns",
    message: `This gift has had ${LIMITS.chatTurnsPerLetter} messages, the most one gift can take. Start a new gift to keep going.`,
  }
}

// Calendars for real accounts only; `null` is a visitor with no session at all.
export function calendarResult(user: { isAnonymous: boolean } | null): LimitResult {
  if (!user || user.isAnonymous) return signInRequiredResult()
  return { ok: true }
}

export function signInRequiredResult(): LimitResult {
  return {
    ok: false,
    reason: "signin_required",
    message:
      "Calendars need an account, so you can come back to them day after day. Creating one takes a minute, and everything you made as a guest comes with you.",
  }
}
