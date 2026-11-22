// The pop-up wedding invitation as a still drawing, in the page's palette: the
// closed card propped up, with the edges of its cut-paper layers peeking from
// the fold. It is what the server renders, what shows while three.js loads,
// the whole picture with reduced motion or without WebGL, and the thumbnail.
// No hooks, so <TemplateCard> can render it on the server.
import type { CSSProperties } from "react"

const fill = (value: string): CSSProperties => ({ fill: value })

export function InviteCardDrawing({ names, forName, className = "" }: { names: string; forName: string; className?: string }) {
  return (
    <svg viewBox="0 0 300 250" className={className} aria-hidden="true">
      <ellipse cx="150" cy="232" rx="118" ry="10" fill="#000" opacity="0.22" />
      {/* The cut-paper layers, folded inside, just showing at the top. */}
      <rect x="34" y="34" width="232" height="18" rx="2" style={fill("var(--paper-accent)")} />
      <rect x="30" y="40" width="240" height="18" rx="2" style={fill("var(--accent-soft)")} />
      <g transform="rotate(-1.2 150 140)">
        <rect x="24" y="48" width="252" height="176" rx="3" style={fill("var(--paper)")} />
        <rect x="24" y="48" width="252" height="6" style={fill("color-mix(in srgb, var(--paper-ink) 8%, var(--paper))")} />
        <rect x="34" y="60" width="232" height="154" rx="1" fill="none" stroke="var(--paper-accent)" strokeWidth="2" opacity="0.7" />
        <rect x="40" y="66" width="220" height="142" rx="1" fill="none" stroke="var(--paper-accent)" strokeWidth="0.8" opacity="0.7" />
        <text x="150" y="128" textAnchor="middle" style={{ ...fill("var(--paper-accent)"), fontFamily: "var(--formal)", fontWeight: 500, fontSize: names.length > 18 ? 20 : 26 }}>
          {names}
        </text>
        <path d="M108 148 H140 M160 148 H192" stroke="var(--paper-accent)" strokeWidth="1.2" />
        <path d="M150 143 l5 5 -5 5 -5 -5 Z" style={fill("var(--paper-accent)")} />
        <text x="150" y="176" textAnchor="middle" style={{ ...fill("var(--paper-muted)"), fontFamily: "var(--body)", fontStyle: "italic", fontSize: 12 }}>
          {forName}
        </text>
      </g>
    </svg>
  )
}
