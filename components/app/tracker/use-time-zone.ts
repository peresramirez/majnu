"use client"

import { useSyncExternalStore } from "react"

// The viewer's IANA timezone ("Europe/Berlin"), or null while the page is
// rendered on the server and hydrated. useSyncExternalStore hydrates with the
// server value and then re-renders with the browser's, so times rendered in
// UTC on the server switch to local time without a hydration mismatch.
const subscribe = () => () => {}

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

export function useViewerTimeZone(): string | null {
  return useSyncExternalStore(subscribe, browserTimeZone, () => null)
}
