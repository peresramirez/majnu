// Every finder request needs a Supabase session. A visitor who has not signed
// up gets an invisible anonymous account first (docs/plan.md, "Gift finder"):
// an invisible Cloudflare Turnstile check gives a token, and Supabase verifies
// it when it creates the account. Without a site key (local development) the
// account is created without a token. A visitor who already has a session,
// anonymous or not, keeps it.
import { createClient } from "@/lib/supabase/client"

const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
const CHECK_TIMEOUT_MS = 30_000

type TurnstileOptions = {
  sitekey: string
  callback: (token: string) => void
  "error-callback": () => void
  "expired-callback": () => void
  "timeout-callback": () => void
  appearance: "always" | "execute" | "interaction-only"
  execution: "render" | "execute"
  retry: "auto" | "never"
  theme: "auto" | "light" | "dark"
  size: "normal" | "flexible" | "compact"
}

type Turnstile = {
  render(container: HTMLElement, options: TurnstileOptions): string | undefined
  remove(widgetId: string): void
}

declare global {
  interface Window {
    turnstile?: Turnstile
  }
}

export type SessionErrorCode = "anonymous_disabled" | "check_failed" | "busy" | "offline"

export class SessionError extends Error {
  constructor(
    message: string,
    readonly code: SessionErrorCode,
  ) {
    super(message)
    this.name = "SessionError"
  }
}

const MESSAGES: Record<SessionErrorCode, string> = {
  anonymous_disabled: "Finding a gift without an account isn't open yet. Sign in to search with your account.",
  check_failed: "Majnu couldn't check this browser. Reload the page and try again.",
  busy: "A lot of people are arriving at once. Wait a minute, then try again.",
  offline: "Majnu couldn't start your search. Check your connection and try again.",
}

const fail = (code: SessionErrorCode) => new SessionError(MESSAGES[code], code)

let scriptLoading: Promise<Turnstile> | null = null

function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptLoading) return scriptLoading
  scriptLoading = new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script")
    script.src = TURNSTILE_SRC
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(fail("check_failed")))
    script.onerror = () => {
      script.remove()
      reject(fail("check_failed"))
    }
    document.head.appendChild(script)
  }).catch((error) => {
    // Let the next attempt load the script again.
    scriptLoading = null
    throw error
  })
  return scriptLoading
}

// One Turnstile token. The widget runs straight away and stays hidden unless
// Cloudflare asks for an interaction, which an invisible widget never does.
async function captchaToken(siteKey: string, container: HTMLElement): Promise<string> {
  const turnstile = await loadTurnstile()
  return new Promise<string>((resolve, reject) => {
    let widgetId: string | undefined
    let settled = false
    const finish = (result: { token: string } | { error: SessionError }) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      if (widgetId) {
        try {
          turnstile.remove(widgetId)
        } catch {
          // Already gone with its container.
        }
      }
      if ("token" in result) resolve(result.token)
      else reject(result.error)
    }
    const timer = window.setTimeout(() => finish({ error: fail("check_failed") }), CHECK_TIMEOUT_MS)
    try {
      widgetId = turnstile.render(container, {
        sitekey: siteKey,
        callback: (token) => finish({ token }),
        "error-callback": () => finish({ error: fail("check_failed") }),
        "expired-callback": () => finish({ error: fail("check_failed") }),
        "timeout-callback": () => finish({ error: fail("check_failed") }),
        appearance: "interaction-only",
        execution: "render",
        retry: "never",
        theme: "dark",
        size: "flexible",
      })
    } catch {
      finish({ error: fail("check_failed") })
    }
  })
}

function errorFromSupabase(error: { code?: string; status?: number; message?: string }): SessionError {
  const code = error.code ?? ""
  const message = (error.message ?? "").toLowerCase()
  if (code === "anonymous_provider_disabled" || message.includes("anonymous sign-ins are disabled")) return fail("anonymous_disabled")
  if (code === "captcha_failed" || message.includes("captcha")) return fail("check_failed")
  if (error.status === 429 || code.startsWith("over_")) return fail("busy")
  return fail("offline")
}

let pending: Promise<void> | null = null

// Resolves once the browser has a session. `getContainer` gives the element the
// Turnstile widget may render into; a hidden one is made when there is none.
// Calls made while one is running share it, so a visitor gets one account.
export function ensureAnonymousSession(getContainer: () => HTMLElement | null): Promise<void> {
  pending ??= signIn(getContainer).finally(() => {
    pending = null
  })
  return pending
}

async function signIn(getContainer: () => HTMLElement | null): Promise<void> {
  const supabase = createClient()
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session) return
  } catch {
    throw fail("offline")
  }

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  let token: string | undefined
  if (siteKey) {
    let container = getContainer()
    let temporary: HTMLElement | null = null
    if (!container) {
      temporary = document.createElement("div")
      temporary.hidden = true
      document.body.appendChild(temporary)
      container = temporary
    }
    try {
      token = await captchaToken(siteKey, container)
    } finally {
      temporary?.remove()
    }
  }

  let result: Awaited<ReturnType<typeof supabase.auth.signInAnonymously>>
  try {
    result = await supabase.auth.signInAnonymously(token ? { options: { captchaToken: token } } : undefined)
  } catch {
    throw fail("offline")
  }
  if (result.error) throw errorFromSupabase(result.error)
}
