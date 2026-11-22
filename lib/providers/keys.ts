// The one place that knows which API key a call should use (issue #67;
// docs/features/provider-fallbacks.md).
//
// Each provider has its primary key and an optional fallback key:
//
//   anthropic  ANTHROPIC_API_KEY  ANTHROPIC_API_KEY_FALLBACK
//   openai     OPENAI_API_KEY     OPENAI_API_KEY_FALLBACK
//   daytona    DAYTONA_API_KEY    DAYTONA_API_KEY_FALLBACK
//
// Claude Code in the Daytona sandbox uses DAYTONA_ANTHROPIC_API_KEY when it is
// set (else ANTHROPIC_API_KEY), and ANTHROPIC_API_KEY_FALLBACK as its fallback.
//
// Without a fallback key nothing here changes a call: the primary key is used
// exactly as before. With one, a primary key that was refused for a reason
// waiting will not fix (lib/providers/classify.ts) is left alone for
// COOL_OFF_MS, and calls go to the fallback key, within FALLBACK_CAP_USD a
// month (lib/providers/ledger.ts). After the cooling-off period the primary is
// tried again.
//
// The cooling-off state lives in memory, per server process (on Cloudflare,
// per Worker isolate). A fresh isolate tries the primary once more; a refused
// request is answered at once and costs nothing.
import "server-only"

export type Provider = "anthropic" | "openai" | "daytona"

export const PROVIDERS: readonly Provider[] = ["anthropic", "openai", "daytona"]

export const KEY_NAMES: Record<Provider, { primary: string; fallback: string }> = {
  anthropic: { primary: "ANTHROPIC_API_KEY", fallback: "ANTHROPIC_API_KEY_FALLBACK" },
  openai: { primary: "OPENAI_API_KEY", fallback: "OPENAI_API_KEY_FALLBACK" },
  daytona: { primary: "DAYTONA_API_KEY", fallback: "DAYTONA_API_KEY_FALLBACK" },
}

type Env = Record<string, string | undefined>

export function readKey(name: string, env: Env = process.env): string | undefined {
  return env[name]?.trim() || undefined
}

// The fallback key, or undefined when it is not set or is the primary itself.
export function fallbackKey(provider: Provider, env: Env = process.env, primaryName = KEY_NAMES[provider].primary): string | undefined {
  const fallback = readKey(KEY_NAMES[provider].fallback, env)
  return fallback && fallback !== readKey(primaryName, env) ? fallback : undefined
}

export const DEFAULT_FALLBACK_CAP_USD = 150

// FALLBACK_CAP_USD: US dollars each fallback key may spend per calendar month
// (UTC), the same cap for every provider. 0 keeps the fallbacks unused; empty
// or invalid means the default.
export function fallbackCapUsd(env: Env = process.env): number {
  const raw = env.FALLBACK_CAP_USD?.trim()
  if (!raw) return DEFAULT_FALLBACK_CAP_USD
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_FALLBACK_CAP_USD
}

// ---------- Cooling-off ----------

export const COOL_OFF_MS = 15 * 60 * 1000

// By key name (the environment variable), never by the key itself.
const refused = new Map<string, { until: number; reason: string }>()

export function isCoolingOff(keyName: string, now: number = Date.now()): boolean {
  const entry = refused.get(keyName)
  if (!entry) return false
  if (entry.until <= now) {
    refused.delete(keyName)
    return false
  }
  return true
}

export function coolOff(keyName: string, reason: string, now: number = Date.now()): void {
  refused.set(keyName, { until: now + COOL_OFF_MS, reason })
}

export function coolingOffReason(keyName: string, now: number = Date.now()): string | undefined {
  return isCoolingOff(keyName, now) ? refused.get(keyName)?.reason : undefined
}

// For tests.
export function resetCoolingOff(): void {
  refused.clear()
}

// One log line per switch, with no key, message text or user data.
export function logProviderEvent(line: string): void {
  console.warn(`[providers] ${line}`)
}
