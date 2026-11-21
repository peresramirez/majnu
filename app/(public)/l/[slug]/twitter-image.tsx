// The same envelope for X's summary_large_image card (see opengraph-image.tsx).
import { OG_SIZE } from "@/components/letters/og-envelope"
import { renderEnvelope } from "./render-envelope"

export const alt = "A sealed envelope from Majnu"
export const size = OG_SIZE
export const contentType = "image/png"

export default renderEnvelope
