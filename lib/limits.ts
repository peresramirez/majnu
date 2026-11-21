// Spending guard and plan gating for every route that calls the model.
// Signatures are shared; the bodies are built with the data work (issue #11).
//
// Counts go through the signed-in user's client, so row-level security limits
// them to that user's own letters. Without a session the queries fail and the
// functions throw.
import "server-only"
import type { LimitReason } from "@/lib/agents/events"
import { plans } from "@/lib/plans"
import { createClient } from "@/lib/supabase/server"

export const LIMITS = {
  lettersPerDay: 5,
  chatTurnsPerLetter: 40,
} as const

// Until Stripe takes live payments (issue #14), every user gets Full moon
// features and only the spending guard applies. Set MAJNU_BILLING=on to enforce plans.
export const billingEnabled = () => process.env.MAJNU_BILLING === "on"

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

// May the signed-in user use a Full moon feature (advent calendars, gift research),
// or publish one more gift this month on the free plan?
// Call "new_gift" before the first build of a letter, not on edits: it counts
// this month's letters that already have content.
export async function canUseFeature(feature: "calendar" | "research" | "new_gift"): Promise<LimitResult> {
  if (!billingEnabled()) return { ok: true }

  const supabase = await createClient()
  const { data: profile, error } = await supabase.from("profiles").select("plan").maybeSingle()
  if (error) throw new Error(`Could not load the plan: ${error.message}`)
  if (profile?.plan === plans.fullMoon.id) return { ok: true }

  if (feature !== "new_gift") return fullMoonOnlyResult(feature)

  const { count, error: countError } = await supabase
    .from("letters")
    .select("id", { count: "exact", head: true })
    .not("content", "is", null)
    .gte("created_at", startOfUtcMonth(new Date()).toISOString())
  if (countError) throw new Error(`Could not count this month's gifts: ${countError.message}`)
  return monthlyGiftsResult(count ?? 0)
}

// ---------- Pure helpers (unit-tested) ----------

export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
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

export function monthlyGiftsResult(giftsThisMonth: number): LimitResult {
  if (giftsThisMonth < plans.free.giftsPerMonth) return { ok: true }
  return {
    ok: false,
    reason: "monthly_gifts",
    message: `You have made your ${plans.free.giftsPerMonth} free gifts this month. Choose ${plans.fullMoon.name} for unlimited gifts, or make another next month.`,
  }
}

export function fullMoonOnlyResult(feature: "calendar" | "research"): LimitResult {
  const name = plans.fullMoon.name
  return {
    ok: false,
    reason: "full_moon_only",
    message:
      feature === "calendar"
        ? `Calendars, with one door a day, come with ${name}. Choose ${name} to make one.`
        : `Gift research comes with ${name}: Majnu searches the web for ideas and current deals. Choose ${name} to use it.`,
  }
}
