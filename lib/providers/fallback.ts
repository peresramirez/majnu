// One call with the primary key, or with the fallback key when the primary
// cannot be used, for providers we call with fetch (OpenAI, Daytona). The
// Anthropic SDK client does the same in its middleware
// (lib/providers/anthropic.ts).
//
//   no fallback key set        → the primary key, exactly as before
//   primary works              → its answer, or its own error
//   primary refused for a key,
//   billing or quota reason    → the primary cools off for 15 minutes; the
//                                call goes to the fallback within the cap
//   primary cooling off        → straight to the fallback
//   fallback refused, cooling
//   off, or over the cap       → the primary is tried once more if it was
//                                skipped; otherwise ProviderUnavailableError,
//                                which callers answer with their "busy" message
import "server-only"
import type { SwitchReason } from "./classify"
import { KEY_NAMES, coolOff, fallbackKey, isCoolingOff, logProviderEvent, readKey, type Provider } from "./keys"
import { reserveFallbackSpend, settleFallbackSpend, type Reservation } from "./ledger"

export type KeySlot = "primary" | "fallback"

export class ProviderUnavailableError extends Error {
  override name = "ProviderUnavailableError"
  constructor(
    readonly provider: Provider,
    // Why no key could be used, for the log: never a key or user text.
    readonly detail: string,
  ) {
    super(`No ${provider} key can be used right now: ${detail}`)
  }
}

export type FallbackCall<T> = {
  provider: Provider
  // The primary key's variable, when it is not the provider's usual one.
  primaryName?: string
  // An upper bound on what one call with the fallback key costs.
  reserveUsd: number
  run: (key: string, slot: KeySlot) => Promise<T>
  // Why an error means the key cannot be used (lib/providers/classify.ts),
  // or null to pass the error on unchanged.
  switchReason: (error: unknown) => SwitchReason | null
  // The cost of a successful fallback call.
  costUsd: (result: T) => number
  // The cost of a failed fallback call: 0 when the provider does not bill a
  // refused request (the default).
  costOnError?: (error: unknown) => number
}

export async function callWithFallback<T>(call: FallbackCall<T>): Promise<T> {
  const { result, reservation } = await callWithFallbackKey(call)
  if (reservation) await settleFallbackSpend(reservation, call.costUsd(result))
  return result
}

export type KeyedResult<T> = { result: T; slot: KeySlot; reservation: Reservation | null }

// The same, for a call whose cost is known only later (a Daytona sandbox costs
// what it runs for): the caller settles the reservation itself, with
// settleFallbackSpend, once the cost is known. `reservation` is null for a
// call made with the primary key.
export async function callWithFallbackKey<T>(call: Omit<FallbackCall<T>, "costUsd">): Promise<KeyedResult<T>> {
  const { provider } = call
  const primaryName = call.primaryName ?? KEY_NAMES[provider].primary
  const fallbackName = KEY_NAMES[provider].fallback
  const primary = readKey(primaryName)
  const fallback = fallbackKey(provider, process.env, primaryName)
  if (!fallback) {
    if (!primary) throw new ProviderUnavailableError(provider, `${primaryName} is not set`)
    return { result: await call.run(primary, "primary"), slot: "primary", reservation: null }
  }

  let primaryTried = false
  if (primary && !isCoolingOff(primaryName)) {
    primaryTried = true
    try {
      return { result: await call.run(primary, "primary"), slot: "primary", reservation: null }
    } catch (error) {
      const reason = call.switchReason(error)
      if (!reason) throw error
      coolOff(primaryName, reason)
      logProviderEvent(`${provider}: ${primaryName} refused (${reason}); using ${fallbackName} for the next 15 minutes`)
    }
  }

  // The primary was skipped while cooling off and the fallback cannot help:
  // one more try with the primary, which may have recovered.
  const lastResort = async (why: string): Promise<KeyedResult<T>> => {
    if (primaryTried || !primary) throw new ProviderUnavailableError(provider, why)
    try {
      return { result: await call.run(primary, "primary"), slot: "primary", reservation: null }
    } catch (error) {
      const reason = call.switchReason(error)
      if (!reason) throw error
      coolOff(primaryName, reason)
      throw new ProviderUnavailableError(provider, `${why}; ${primaryName} refused again (${reason})`)
    }
  }

  if (isCoolingOff(fallbackName)) return lastResort(`${fallbackName} is cooling off`)
  const reservation = await reserveFallbackSpend(provider, call.reserveUsd)
  if (!reservation) return lastResort(`the ${provider} fallback cap is reached or could not be checked`)

  let result: T
  try {
    result = await call.run(fallback, "fallback")
  } catch (error) {
    await settleFallbackSpend(reservation, call.costOnError?.(error) ?? 0)
    const reason = call.switchReason(error)
    if (!reason) throw error
    coolOff(fallbackName, reason)
    logProviderEvent(`${provider}: ${fallbackName} refused too (${reason})`)
    throw new ProviderUnavailableError(provider, `${fallbackName} refused (${reason})`)
  }
  return { result, slot: "fallback", reservation }
}
