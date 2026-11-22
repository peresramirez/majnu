// The gift tin as a still drawing, in the page's palette: a round tin with a
// star pattern, its lid and label, and a few sparkles. It is what the server
// renders, what shows while three.js loads, the whole picture with reduced
// motion or without WebGL, and the thumbnail. No hooks, so <TemplateCard> can
// render it on the server.
import type { CSSProperties } from "react"

const fill = (value: string): CSSProperties => ({ fill: value })

function Star({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  return <path d={`M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`} style={fill(color)} />
}

// Stars on the tin's side: [x, y].
const SIDE: [number, number][] = [
  [78, 168],
  [110, 182],
  [142, 172],
  [174, 184],
  [206, 170],
  [94, 206],
  [126, 216],
  [158, 210],
  [190, 218],
]

export function TinDrawing({ forName, className = "" }: { forName: string; className?: string }) {
  return (
    <svg viewBox="0 0 280 290" className={className} aria-hidden="true">
      <ellipse cx="140" cy="262" rx="104" ry="14" fill="#000" opacity="0.24" />
      <Star x={36} y={70} s={10} color="var(--accent)" />
      <Star x={246} y={96} s={7} color="var(--accent-soft)" />
      <Star x={230} y={40} s={5} color="var(--accent)" />
      {/* The body. */}
      <path d="M52 132 V236 A88 22 0 0 0 228 236 V132 Z" style={fill("var(--wrap)")} />
      <path d="M52 228 A88 22 0 0 0 228 228 V238 A88 22 0 0 1 52 238 Z" style={fill("var(--accent)")} />
      {SIDE.map(([x, y], i) => (
        <Star key={i} x={x} y={y} s={5} color="var(--accent-soft)" />
      ))}
      <path d="M52 132 V236 A88 22 0 0 0 96 254 V150 Z" fill="#000" opacity="0.12" />
      {/* The lid. */}
      <path d="M46 116 V140 A94 24 0 0 0 234 140 V116 Z" style={fill("var(--accent)")} />
      <path d="M46 116 V140 A94 24 0 0 0 100 160 V136 Z" fill="#000" opacity="0.1" />
      <ellipse cx="140" cy="116" rx="94" ry="24" style={fill("color-mix(in srgb, var(--accent) 82%, white)")} />
      <ellipse cx="140" cy="116" rx="70" ry="17" style={fill("var(--paper)")} />
      <ellipse cx="140" cy="116" rx="64" ry="15" fill="none" stroke="var(--paper-accent)" strokeWidth="1.2" />
      <text x="140" y="121" textAnchor="middle" transform="translate(0 0)" style={{ ...fill("var(--paper-accent)"), fontFamily: "var(--display)", fontWeight: 500, fontSize: forName.length > 14 ? 11 : 14 }}>
        {forName}
      </text>
    </svg>
  )
}
