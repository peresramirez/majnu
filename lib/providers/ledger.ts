// The fallback keys' spend cap: at most FALLBACK_CAP_USD per provider and
// calendar month (UTC), counted in provider_spend
// (supabase/migrations/0010_provider_spend.sql) with the service-role client.
//
// Every call made with a fallback key goes:
//   1. reserveFallbackSpend(provider, upper bound): the database adds the
//      estimate only if the month's total stays within the cap, in one atomic
//      statement, so concurrent calls cannot together go past it. Refused (or
//      the database unreachable) means the call is not made.
//   2. the call.
//   3. settleFallbackSpend(reservation, cost): replaces the reservation with
//      the estimate from the provider's reported usage (lib/providers/costs.ts)
//      and logs the month's total. A call that failed without being billed
//      settles at 0.
//
// Calls with the primary keys are not counted: their limits are set in the
// providers' consoles.
import "server-only"
import { createAdminClient } from "@/lib/supabase/admin"
import { fallbackCapUsd, logProviderEvent, type Provider } from "./keys"

export type Reservation = { provider: Provider; month: string; usd: number }

// The first day of the month (UTC) as YYYY-MM-01.
export function monthOf(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`
}

// Amounts go to the database rounded up to a millionth of a dollar, its precision.
function micro(usd: number): number {
  return Math.ceil(Math.max(usd, 0) * 1_000_000) / 1_000_000
}

function asNumber(data: unknown): number | null {
  if (data === null || data === undefined) return null
  const value = typeof data === "number" ? data : Number(data)
  return Number.isFinite(value) ? value : null
}

function format(usd: number): string {
  return `$${usd.toFixed(usd < 1 ? 4 : 2)}`
}

// The reservation, or null when the cap does not allow this call (or the
// total could not be checked: without a check, no fallback call is made).
export async function reserveFallbackSpend(provider: Provider, usd: number, now: Date = new Date()): Promise<Reservation | null> {
  const month = monthOf(now)
  const cap = fallbackCapUsd()
  const amount = micro(usd)
  try {
    const { data, error } = await createAdminClient().rpc("reserve_provider_spend", {
      p_provider: provider,
      p_month: month,
      p_usd: amount,
      p_cap_usd: cap,
    })
    if (error) throw new Error(error.message)
    const total = asNumber(data)
    if (total === null) {
      logProviderEvent(`${provider} fallback refused: this call (up to ${format(amount)}) would pass the cap of ${format(cap)} for ${month.slice(0, 7)}`)
      return null
    }
    return { provider, month, usd: amount }
  } catch (error) {
    logProviderEvent(`${provider} fallback refused: the spend total could not be checked (${error instanceof Error ? error.message : "unknown error"})`)
    return null
  }
}

// Replaces the reservation with the call's estimated cost. Never throws: the
// call itself already happened.
export async function settleFallbackSpend(reservation: Reservation, costUsd: number): Promise<void> {
  const cost = micro(costUsd)
  const delta = Math.round((cost - reservation.usd) * 1_000_000) / 1_000_000
  try {
    let total: number | null = null
    if (delta !== 0) {
      const { data, error } = await createAdminClient().rpc("settle_provider_spend", {
        p_provider: reservation.provider,
        p_month: reservation.month,
        p_delta_usd: delta,
      })
      if (error) throw new Error(error.message)
      total = asNumber(data)
    }
    if (cost > 0) {
      const month = total === null ? "" : `; ${reservation.month.slice(0, 7)} total ${format(total)} of ${format(fallbackCapUsd())}`
      logProviderEvent(`${reservation.provider} fallback call: about ${format(cost)}${month}`)
    }
  } catch (error) {
    // The reservation stays counted, which errs towards stopping early.
    logProviderEvent(`${reservation.provider} fallback spend not settled, the reservation of ${format(reservation.usd)} stays counted (${error instanceof Error ? error.message : "unknown error"})`)
  }
}
