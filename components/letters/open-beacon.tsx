"use client"

// Reports one `open` per page load of /l/[slug]. It runs in the browser, so
// link-preview crawlers (WhatsApp, iMessage) that fetch the HTML do not count.
// A page prerendered in the background waits until someone actually looks at it.
// Never sends anything in the owner's preview.
import { useEffect } from "react"
import { reportOpen } from "./track"

export function OpenBeacon({ slug, ownerPreview }: { slug: string; ownerPreview: boolean }) {
  useEffect(() => {
    if (ownerPreview || !slug) return
    const send = () => reportOpen(slug, ownerPreview)
    if (document.visibilityState === "visible") {
      send()
      return
    }
    const onVisible = () => {
      if (document.visibilityState !== "visible") return
      document.removeEventListener("visibilitychange", onVisible)
      send()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [slug, ownerPreview])
  return null
}
