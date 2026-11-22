// The party ticket as a still drawing, in the page's palette: the ticket with
// its stub, a little confetti around it. It is what the server renders, what
// shows while three.js loads, the whole picture with reduced motion or without
// WebGL, and the thumbnail. No hooks, so <TemplateCard> can render it.
import type { CSSProperties } from "react"

const fill = (value: string): CSSProperties => ({ fill: value })

// [x, y, rotation, colour]
const CONFETTI: [number, number, number, string][] = [
  [34, 40, 24, "var(--accent)"],
  [214, 30, -30, "#f6c453"],
  [24, 150, 50, "var(--accent-soft)"],
  [226, 120, -18, "var(--paper-accent)"],
  [40, 250, -40, "#f6c453"],
  [220, 236, 30, "var(--accent)"],
  [196, 70, 64, "var(--accent-soft)"],
  [60, 96, -60, "var(--paper-accent)"],
]

export function TicketDrawing({ forName, occasion, className = "" }: { forName: string; occasion: string; className?: string }) {
  return (
    <svg viewBox="0 0 250 330" className={className} aria-hidden="true">
      <ellipse cx="125" cy="318" rx="70" ry="8" fill="#000" opacity="0.22" />
      {CONFETTI.map(([x, y, r, color], i) => (
        <rect key={i} x={x} y={y} width="7" height="12" rx="1.5" transform={`rotate(${r} ${x} ${y})`} style={fill(color)} />
      ))}
      <g transform="rotate(-4 125 160)">
        {/* Body with notches at the perforation. */}
        <path d="M70 26 h110 a8 8 0 0 1 8 8 v196 a9 9 0 0 0 0 18 h-126 a9 9 0 0 0 0 -18 v-196 a8 8 0 0 1 8 -8 Z" style={fill("var(--paper)")} />
        <path d="M70 26 h110 a8 8 0 0 1 8 8 v22 h-126 v-22 a8 8 0 0 1 8 -8 Z" style={fill("var(--accent)")} />
        <text x="125" y="46" textAnchor="middle" style={{ ...fill("var(--deep)"), fontFamily: "var(--body)", fontWeight: 700, fontSize: 9, letterSpacing: "0.3em" }}>
          ADMIT ONE
        </text>
        <text x="125" y="98" textAnchor="middle" style={{ ...fill("var(--paper-muted)"), fontFamily: "var(--body)", fontWeight: 600, fontSize: 8, letterSpacing: "0.22em" }}>
          {occasion.toUpperCase()}
        </text>
        <text x="125" y="134" textAnchor="middle" style={{ ...fill("var(--paper-accent)"), fontFamily: "var(--display)", fontWeight: 500, fontSize: forName.length > 12 ? 17 : 22 }}>
          {forName}
        </text>
        <path d="M95 156 H118 M132 156 H155" stroke="var(--paper-accent)" strokeWidth="1.2" />
        <path d="M125 152 l4 4 -4 4 -4 -4 Z" style={fill("var(--paper-accent)")} />
        <path d="M74 239 H176" stroke="var(--paper-muted)" strokeWidth="1.6" strokeDasharray="2 5" strokeLinecap="round" />
        {/* The stub below the perforation. */}
        <path d="M62 248 h126 v44 a8 8 0 0 1 -8 8 h-110 a8 8 0 0 1 -8 -8 Z" style={fill("var(--paper)")} />
        {Array.from({ length: 16 }, (_, i) => (
          <rect key={i} x={82 + i * 5.6} y="258" width={i % 3 ? 2 : 3.4} height="22" style={fill("var(--paper-ink)")} />
        ))}
      </g>
    </svg>
  )
}
