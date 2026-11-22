"use client"

import { useViewerTimeZone } from "./use-time-zone"

// Which timezone the times are in: UTC in the server's HTML, then the
// viewer's own once the page has loaded.
export function TimeZoneNote() {
  const timeZone = useViewerTimeZone()
  return <>Times are in {timeZone ? `your timezone, ${timeZone.replaceAll("_", " ")}` : "UTC"}.</>
}
