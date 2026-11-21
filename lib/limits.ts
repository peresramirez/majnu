// Spending guard and plan gating for every route that calls the model.
// Signatures are shared; the bodies are built with the data work (issue #11).
import "server-only"
import type { LimitReason } from "@/lib/agents/events"

export const LIMITS = {
  lettersPerDay: 5,
  chatTurnsPerLetter: 40,
} as const

// Until Stripe takes live payments (issue #14), every user gets Full moon
// features and only the spending guard applies. Set MAJNU_BILLING=on to enforce plans.
export const billingEnabled = () => process.env.MAJNU_BILLING === "on"

export type LimitResult = { ok: true } | { ok: false; reason: LimitReason; message: string }

// May the signed-in user start another letter today?
export async function canCreateLetter(): Promise<LimitResult> {
  throw new Error("canCreateLetter: not built yet")
}

// May the signed-in user send another message in this letter's chat?
export async function canSendChatTurn(letterId: string): Promise<LimitResult> {
  void letterId
  throw new Error("canSendChatTurn: not built yet")
}

// May the signed-in user use a Full moon feature (advent calendars, gift research),
// or publish one more gift this month on the free plan?
export async function canUseFeature(feature: "calendar" | "research" | "new_gift"): Promise<LimitResult> {
  void feature
  throw new Error("canUseFeature: not built yet")
}
