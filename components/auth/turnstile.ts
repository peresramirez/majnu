"use client"

// Cloudflare Turnstile, the invisible bot check whose token Supabase verifies
// when captcha protection is on (Supabase → Authentication → Bot and Abuse
// Protection). The widget "Majnu" is set to invisible mode in Cloudflare, so
// nothing is shown; the privacy page links Cloudflare's Turnstile Privacy
// Addendum, which invisible mode requires.
//
// Usage: render <div ref={containerRef} /> inside the form, then
//   const captchaToken = await getToken()   // string, or undefined
//   ...send it with the Supabase call...
//   reset()                                  // a token is valid only once
//
// getToken() resolves to undefined, never hangs and never throws, when there
// is no site key (tests), when the script is blocked, or when the check fails.
// The form then goes ahead without a token: that works while captcha
// protection is off, and Supabase answers with a clear error when it is on.
import { useCallback, useEffect, useRef } from "react"

type TurnstileApi = {
  render(container: HTMLElement, params: Record<string, unknown>): string | undefined
  reset(widgetId: string): void
  remove(widgetId: string): void
  isExpired(widgetId: string): boolean
}

// Read through this rather than a global `Window` declaration: the finder's
// own loader (components/finder/anonymous-session.ts) declares one with a
// narrower type, and two declarations of one property must agree.
function turnstileApi(): TurnstileApi | undefined {
  return (window as unknown as { turnstile?: TurnstileApi }).turnstile
}

// Must be loaded from Cloudflare directly, never proxied or bundled.
const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const TOKEN_WAIT_MS = 10_000

let loading: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  const ready = turnstileApi()
  if (ready) return Promise.resolve(ready)
  if (loading) return loading
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () => {
      const api = turnstileApi()
      if (api) resolve(api)
      else reject(new Error("Turnstile did not start"))
    }
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error("Turnstile did not load"))
    }
    document.head.appendChild(script)
  })
  return loading
}

export function turnstileSiteKey(): string | undefined {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || undefined
}

// `action` labels the check in Cloudflare's analytics, e.g. "signin".
export function useTurnstile(action: string) {
  const siteKey = turnstileSiteKey()
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  const token = useRef<string | null>(null)
  const unavailable = useRef(false)
  // The last check failed (Turnstile retries on its own). Until one passes,
  // getToken() answers at once instead of keeping the visitor waiting.
  const failed = useRef(false)
  const waiting = useRef<Array<(value: string | undefined) => void>>([])

  const settle = useCallback((value: string | undefined) => {
    const waiters = waiting.current
    waiting.current = []
    waiters.forEach((resolve) => resolve(value))
  }, [])

  // Start the check when the form appears, so the token is usually ready by
  // the time the visitor presses the button (Cloudflare's recommendation).
  useEffect(() => {
    const container = containerRef.current
    if (!siteKey || !container) return
    let cancelled = false
    unavailable.current = false
    failed.current = false

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled) return
        widgetId.current =
          turnstile.render(container, {
            sitekey: siteKey,
            action,
            "response-field": false,
            "refresh-expired": "auto",
            callback: (value: string) => {
              token.current = value
              failed.current = false
              settle(value)
            },
            "expired-callback": () => {
              token.current = null
            },
            "error-callback": () => {
              token.current = null
              failed.current = true
              settle(undefined)
            },
            "timeout-callback": () => {
              token.current = null
              failed.current = true
              settle(undefined)
            },
          }) ?? null
      })
      .catch(() => {
        unavailable.current = true
        settle(undefined)
      })

    return () => {
      cancelled = true
      if (widgetId.current) turnstileApi()?.remove(widgetId.current)
      widgetId.current = null
      token.current = null
      settle(undefined)
    }
  }, [siteKey, action, settle])

  const getToken = useCallback((): Promise<string | undefined> => {
    if (!siteKey || unavailable.current || failed.current) return Promise.resolve(undefined)
    const id = widgetId.current
    if (token.current && id && !turnstileApi()?.isExpired(id)) return Promise.resolve(token.current)
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(undefined), TOKEN_WAIT_MS)
      waiting.current.push((value) => {
        clearTimeout(timer)
        resolve(value)
      })
    })
  }, [siteKey])

  // After every submit: Supabase has spent the token, so fetch a fresh one
  // for the next attempt.
  const reset = useCallback(() => {
    token.current = null
    const id = widgetId.current
    if (id) turnstileApi()?.reset(id)
  }, [])

  return { containerRef, getToken, reset }
}
