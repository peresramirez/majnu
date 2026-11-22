// Where a "Back" link goes (issue #66, docs/features/app-shell.md "Back links").
// Pure, so it is unit-tested; the browser side is in ./use-back.tsx.
//
// The browser's own history cannot be read, and document.referrer is of little
// use: Next.js changes pages without reloading, so it keeps naming the page the
// tab first came from, and gift pages send no referrer at all. So each tab
// keeps its own short copy of the pages it visited on this site, the trail:
//
// - a new page is added after the current one (anything ahead is dropped);
// - arriving at the page just before or just after the current one is read as
//   the browser's back or forward button, so the trail moves instead of growing;
// - a Back link names the entry it goes to (the intent), and the trail moves
//   to that entry when the page arrives.
//
// A Back link goes to the nearest earlier entry it is allowed to go to, or to
// its fallback, which takes the current entry's place. Either way the trail's
// position only ever moves back, so following Back links can never loop: it
// ends at a fallback, and fallbacks are pages without a Back link (the landing
// page and the app's tabs).
//
// Allowed: a path on this site (safeNextPath: never another host or scheme),
// never a sign-in or sign-up page (they would only send a signed-in visitor on,
// or start the sign-in again), never a route that is not a page, and never an
// app page for a visitor who is signed out (it would send them to sign in).
import { safeNextPath } from "@/lib/billing/next-path"

export type Trail = { entries: string[]; index: number }

// Written by a Back link just before it navigates: "this is entry `index`".
export type BackIntent = { path: string; index: number }

export const EMPTY_TRAIL: Trail = { entries: [], index: -1 }

// Enough for any real way back; older entries are dropped first.
export const MAX_TRAIL = 30

// Routes that are not pages to come back to: sign-in links and callbacks,
// the API, Stripe's return pages and the developer workbenches.
const NOT_RECORDED = ["/auth", "/api", "/billing", "/dev"]

// Pages that need an account (guests included); lib/supabase/middleware.ts.
const NEEDS_ACCOUNT = ["/dashboard", "/create"]

function under(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

function pathnameOf(path: string) {
  const end = path.search(/[?#]/)
  return end === -1 ? path : path.slice(0, end)
}

// The path as the trail stores it: pathname and query, no fragment. Null for a
// path that is not a page on this site worth remembering.
export function trailPath(pathname: string, search = ""): string | null {
  if (!pathname.startsWith("/") || pathname.startsWith("//")) return null
  if (NOT_RECORDED.some((prefix) => under(pathname, prefix))) return null
  const query = search && search !== "?" ? (search.startsWith("?") ? search : `?${search}`) : ""
  return `${pathname}${query}`
}

// A same-site path a Back link may lead to, or null.
export function backDestination(path: unknown, { signedIn }: { signedIn: boolean }): string | null {
  const safe = safeNextPath(path)
  if (!safe) return null
  const pathname = pathnameOf(safe)
  if (NOT_RECORDED.some((prefix) => under(pathname, prefix))) return null
  if (!signedIn && NEEDS_ACCOUNT.some((prefix) => under(pathname, prefix))) return null
  const hash = safe.indexOf("#")
  return hash === -1 ? safe : safe.slice(0, hash)
}

// A stored trail, checked: anything malformed counts as no trail.
export function parseTrail(value: unknown): Trail {
  if (!value || typeof value !== "object") return EMPTY_TRAIL
  const { entries, index } = value as { entries?: unknown; index?: unknown }
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_TRAIL) return EMPTY_TRAIL
  if (!entries.every((entry) => typeof entry === "string" && entry.startsWith("/"))) return EMPTY_TRAIL
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0 || index >= entries.length) return EMPTY_TRAIL
  return { entries: entries as string[], index }
}

export function parseIntent(value: unknown): BackIntent | null {
  if (!value || typeof value !== "object") return null
  const { path, index } = value as { path?: unknown; index?: unknown }
  if (typeof path !== "string" || typeof index !== "number" || !Number.isInteger(index) || index < 0) return null
  return { path, index }
}

// The trail after arriving at `path`. Calling it again with the same path
// changes nothing, so a reload or a second listener is harmless.
export function recordVisit(trail: Trail, path: string, intent: BackIntent | null = null): Trail {
  const { entries, index } = trail
  if (entries[index] === path) return trail

  // A Back link brought us here: this is entry intent.index (or, for a
  // fallback, the new page in the current entry's place).
  if (intent && intent.path === path && intent.index <= index + 1 && intent.index <= entries.length) {
    const kept = entries.slice(0, intent.index)
    return { entries: [...kept, path], index: kept.length }
  }

  // The browser's back or forward button (or a link to the page just before).
  if (index > 0 && entries[index - 1] === path) return { entries, index: index - 1 }
  if (entries[index + 1] === path) return { entries, index: index + 1 }

  const next = [...entries.slice(0, index + 1), path]
  const dropped = Math.max(0, next.length - MAX_TRAIL)
  return { entries: next.slice(dropped), index: next.length - 1 - dropped }
}

// The nearest earlier entry a Back link may go to.
export function trailTarget(
  trail: Trail,
  current: string,
  allowed: (path: string) => string | null,
): { path: string; index: number } | null {
  for (let i = trail.index - 1; i >= 0; i--) {
    const entry = trail.entries[i]
    if (entry === current) continue
    const path = allowed(entry)
    if (path) return { path, index: i }
  }
  return null
}

// The page a same-site referrer names, as a trail path, or null.
export function referrerPath(referrer: string, origin: string): string | null {
  if (!referrer) return null
  try {
    const url = new URL(referrer)
    if (url.origin !== origin) return null
    return trailPath(url.pathname, url.search)
  } catch {
    return null
  }
}

export type BackInput = {
  trail: Trail
  // A Back link's intent not yet recorded (the page may render before the
  // recorder has run), so both agree on where this page sits in the trail.
  intent?: BackIntent | null
  // The current page, as trailPath() gives it.
  current: string
  signedIn: boolean
  // The page that sent a visitor to sign in (`?next=`), on sign-in and sign-up.
  next?: string | null
  // document.referrer, used only before the trail has anything else.
  referrer?: string
  origin?: string
  fallback: string
}

export type BackResolution = {
  href: string
  // What the Back link writes as its intent before it navigates.
  intent: BackIntent
  from: "trail" | "next" | "referrer" | "fallback"
}

// Where Back goes from the current page, in order: the nearest earlier page in
// this tab's trail, then a same-site `next`, then a same-site referrer when the
// trail holds only this page, then the fallback.
export function resolveBack(input: BackInput): BackResolution {
  const { trail, current, signedIn, fallback } = input
  const allowed = (path: string) => backDestination(path, { signedIn })
  // The position the current page has, or will have once it is recorded.
  const here = recordVisit(trail, current, input.intent ?? null)
  const replaceHere = (href: string, from: BackResolution["from"]): BackResolution => ({
    href,
    intent: { path: href, index: here.index },
    from,
  })

  const fromTrail = trailTarget(here, current, allowed)
  if (fromTrail) return { href: fromTrail.path, intent: fromTrail, from: "trail" }

  const next = input.next ? allowed(input.next) : null
  if (next && next !== current) return replaceHere(next, "next")

  if (here.index <= 0 && input.referrer && input.origin) {
    const ref = referrerPath(input.referrer, input.origin)
    const allowedRef = ref ? allowed(ref) : null
    if (allowedRef && allowedRef !== current) return replaceHere(allowedRef, "referrer")
  }

  return replaceHere(allowed(fallback) ?? "/", "fallback")
}
