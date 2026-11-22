"use client"

// The browser side of ./back.ts: the tab's trail in sessionStorage, the
// recorder that adds each page to it (in the root layout), and <BackLink>.
//
// sessionStorage belongs to one tab and is gone when the tab closes, and the
// trail holds only paths on this site. Where storage is blocked, the trail
// lives in memory until the next full page load.
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState, type MouseEvent, type ReactNode } from "react"
import { useAuth } from "@/components/auth/auth-provider"
import {
  EMPTY_TRAIL,
  parseIntent,
  parseTrail,
  recordVisit,
  resolveBack,
  trailPath,
  type BackIntent,
  type Trail,
} from "./back"

const TRAIL_KEY = "majnu:trail"
const INTENT_KEY = "majnu:back-intent"

let memoryTrail: Trail = EMPTY_TRAIL
let memoryIntent: BackIntent | null = null

function read<T>(key: string, parse: (value: unknown) => T, memory: T): T {
  try {
    const raw = window.sessionStorage.getItem(key)
    return raw === null ? memory : parse(JSON.parse(raw))
  } catch {
    return memory
  }
}

function write(key: string, value: unknown) {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage is blocked: the in-memory copy is all there is.
  }
}

function readTrail(): Trail {
  return read(TRAIL_KEY, parseTrail, memoryTrail)
}

function readIntent(): BackIntent | null {
  return read(INTENT_KEY, parseIntent, memoryIntent)
}

function saveTrail(trail: Trail) {
  memoryTrail = trail
  write(TRAIL_KEY, trail)
}

function saveIntent(intent: BackIntent | null) {
  memoryIntent = intent
  write(INTENT_KEY, intent)
}

function currentPath(): string | null {
  return trailPath(window.location.pathname, window.location.search)
}

// Adds each page this tab shows to its trail. Rendered once, in the root layout.
// A page inside a frame (the gift preview on the create page, the template
// previews) shares the tab's sessionStorage but is not a page the visitor
// went to, so only the top window records.
export function TrailRecorder() {
  const pathname = usePathname()
  useEffect(() => {
    if (window.top !== window.self) return
    const path = currentPath()
    if (path) saveTrail(recordVisit(readTrail(), path, readIntent()))
    // An intent is only good for the navigation it was written for.
    saveIntent(null)
  }, [pathname])
  return null
}

// Where Back goes when this tab has no earlier page to go back to: `fallback`
// for a signed-out visitor, `signedInFallback` for anyone signed in (a guest
// included). Plain strings, so server components can pass them.
export type BackOptions = { fallback: string; signedInFallback?: string; honourNext?: boolean }

// Where Back goes from this page, and the click handler that records it.
// Before hydration (and for a visitor without JavaScript) it is the signed-out
// fallback, so the link always works.
export function useBack({ fallback, signedInFallback = fallback, honourNext = false }: BackOptions) {
  const pathname = usePathname()
  const { user, isLoading } = useAuth()
  const signedIn = !isLoading && user !== null
  const fallbackNow = signedIn ? signedInFallback : fallback
  const [resolved, setResolved] = useState<{ href: string; intent: BackIntent | null }>({ href: fallback, intent: null })

  useEffect(() => {
    const current = currentPath()
    if (!current) return
    const next = honourNext ? new URLSearchParams(window.location.search).get("next") : null
    const result = resolveBack({
      trail: readTrail(),
      intent: readIntent(),
      current,
      signedIn,
      next,
      referrer: document.referrer,
      origin: window.location.origin,
      fallback: fallbackNow,
    })
    setResolved({ href: result.href, intent: result.intent })
  }, [pathname, signedIn, fallbackNow, honourNext])

  function onClick(event: MouseEvent<HTMLAnchorElement>) {
    // A new tab or window keeps this tab where it is.
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (resolved.intent) saveIntent(resolved.intent)
  }

  return { href: resolved.href, onClick }
}

// A "Back" link: a real link (it works without JavaScript and can be opened in
// a new tab) whose address is worked out from this tab's trail.
export function BackLink({
  fallback,
  signedInFallback,
  honourNext,
  className,
  children,
  "aria-label": ariaLabel,
}: BackOptions & {
  className?: string
  children: ReactNode
  "aria-label"?: string
}) {
  const { href, onClick } = useBack({ fallback, signedInFallback, honourNext })
  return (
    <Link href={href} onClick={onClick} className={className} aria-label={ariaLabel} data-back-link="">
      {children}
    </Link>
  )
}
