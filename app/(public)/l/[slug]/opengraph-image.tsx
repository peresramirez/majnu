// The link-preview image for majnu.app/l/<slug>: an envelope addressed to the
// recipient's first name (components/letters/og-envelope.ts and -image.tsx). Nothing from the
// message, the gifts or the event is read into it. Next.js puts this route in
// the page's og:image, ahead of the site image that page-meta.ts sets, which
// stays as the fallback: delete this file and twitter-image.tsx, and every
// letter previews with /brand/majnu-og.png again.
//
// Crawlers (WhatsApp, iMessage) fetch this with no session; the middleware
// matcher already skips /l/. Unknown slugs and lookup failures get the same
// envelope addressed to "you", so the image never fails a preview.
import { OG_SIZE } from "@/components/letters/og-envelope"
import { renderEnvelope } from "./render-envelope"

export const alt = "A sealed envelope from Majnu"
export const size = OG_SIZE
export const contentType = "image/png"

export default renderEnvelope
