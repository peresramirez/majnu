// Metadata for a public letter page. Generic on purpose: the title names the
// kind of gift and the recipient's first name, nothing from the message, the
// gifts or the event, so link previews in WhatsApp or iMessage give nothing away.
import type { Metadata, Viewport } from "next"
import type { PublicLetter } from "@/lib/letters/schema"
import { letterDescription, letterTitle } from "./names"
import { paletteOf } from "./theme"

const hidden = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } }

// The site's own preview image, the same for every letter (docs/brand.md).
const image = { url: "/brand/majnu-og.png", width: 1200, height: 630, alt: "Majnu: personalized digital gifting" }

export function letterMetadata(letter: PublicLetter | null): Metadata {
  if (!letter) return { title: { absolute: "Majnu" }, robots: hidden, referrer: "no-referrer" }
  const title = letterTitle(letter.templateId, letter.content.recipientName)
  const description = letterDescription(letter.content.recipientName)
  return {
    title: { absolute: title },
    description,
    robots: hidden,
    referrer: "no-referrer",
    openGraph: { type: "website", siteName: "Majnu", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  }
}

// The browser bar takes the colour of the page.
export function letterViewport(letter: PublicLetter | null): Viewport {
  return { themeColor: letter ? paletteOf(letter.content.theme).pageFlat : "#1B1226" }
}
