// Pieces of the treasure map shared by the template and its thumbnail. No
// hooks, so <TemplateCard> can render them on the server.
import type { CSSProperties } from "react"
import { paperGrain } from "../../chrome"

// Old paper in every palette: the palette's paper, aged towards tan, darker at
// the edges, with a few stains and the shared grain.
export const parchment: CSSProperties = {
  backgroundColor: "color-mix(in srgb, var(--paper) 76%, #c9a066)",
  backgroundImage: [
    paperGrain,
    "radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(74, 44, 16, 0.2) 100%)",
    "radial-gradient(circle at 18% 22%, rgba(120, 78, 30, 0.1), transparent 22%)",
    "radial-gradient(circle at 82% 70%, rgba(120, 78, 30, 0.08), transparent 26%)",
  ].join(", "),
  color: "var(--paper-ink)",
}

export const ink = "var(--paper-ink)"

// A compass rose, its north point filled.
export function Compass({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <circle cx="50" cy="50" r="34" fill="none" stroke={ink} strokeWidth="1" opacity="0.7" />
      <circle cx="50" cy="50" r="29" fill="none" stroke={ink} strokeWidth="0.5" opacity="0.6" strokeDasharray="1.5 2.5" />
      <path d="M50 8 L56 50 L50 92 L44 50 Z" fill="none" stroke={ink} strokeWidth="1" />
      <path d="M50 8 L56 50 L44 50 Z" style={{ fill: "var(--paper-accent)" }} />
      <path d="M8 50 L50 44 L92 50 L50 56 Z" fill="none" stroke={ink} strokeWidth="1" opacity="0.8" />
      <path d="M22 22 L52 48 L78 78 L48 52 Z" fill="none" stroke={ink} strokeWidth="0.6" opacity="0.5" />
      <path d="M78 22 L52 52 L22 78 L48 48 Z" fill="none" stroke={ink} strokeWidth="0.6" opacity="0.5" />
      <circle cx="50" cy="50" r="3" fill={ink} />
      <text x="50" y="5" textAnchor="middle" fontSize="8" fill={ink} style={{ fontFamily: "var(--display)" }}>
        N
      </text>
    </svg>
  )
}

