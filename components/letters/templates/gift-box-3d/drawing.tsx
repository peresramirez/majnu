// The 3D gift box as a still drawing, in the page's palette. It is what the
// server renders, what shows while three.js loads, the whole picture when the
// visitor prefers reduced motion or the browser has no WebGL, and the
// template's thumbnail. No hooks, so <TemplateCard> can render it on the
// server; `idPrefix` keeps the SVG pattern ids unique on a page.
import type { CSSProperties } from "react"
import type { BoxMood } from "./layout"

const fill = (value: string): CSSProperties => ({ fill: value })

// Four-pointed sparkles around the gift box: [x, y, size, colour variable].
const SPARKLES: [number, number, number, string][] = [
  [34, 70, 9, "var(--accent-soft)"],
  [222, 52, 12, "var(--accent)"],
  [236, 150, 7, "var(--accent-soft)"],
  [20, 168, 6, "var(--accent)"],
  [178, 30, 6, "var(--accent-soft)"],
]

// Confetti around the party box: [x, y, rotation, colour].
const CONFETTI: [number, number, number, string][] = [
  [92, 34, 20, "var(--accent)"],
  [160, 22, -30, "#f6c453"],
  [118, 58, 60, "var(--accent-soft)"],
  [186, 70, -12, "var(--paper-accent)"],
  [70, 82, 44, "#f6c453"],
  [24, 196, -24, "var(--accent-soft)"],
  [236, 188, 32, "var(--accent)"],
]

function Sparkle({ x, y, s, color }: { x: number; y: number; s: number; color: string }) {
  const d = `M${x} ${y - s} Q${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z`
  return <path d={d} style={fill(color)} opacity="0.85" />
}

function Balloon({ x, y, color, tilt }: { x: number; y: number; color: string; tilt: number }) {
  return (
    <g transform={`rotate(${tilt} ${x} ${y + 30})`}>
      <path d={`M${x} ${y + 26} C ${x - 6} ${y + 52}, ${x + 10} ${y + 70}, ${x + 2} ${y + 96}`} fill="none" stroke="var(--page-muted)" strokeWidth="1.2" opacity="0.7" />
      <ellipse cx={x} cy={y} rx="19" ry="23" style={fill(color)} />
      <path d={`M${x - 4} ${y + 22} L${x + 4} ${y + 22} L${x} ${y + 28} Z`} style={fill(color)} />
      <ellipse cx={x - 7} cy={y - 9} rx="5" ry="8" fill="#fff" opacity="0.32" transform={`rotate(-20 ${x - 7} ${y - 9})`} />
    </g>
  )
}

export function BoxDrawing({ mood, idPrefix, className = "" }: { mood: BoxMood; idPrefix: string; className?: string }) {
  const paper = `${idPrefix}-paper`
  const shade = `${idPrefix}-shade`
  const gift = mood === "gift"
  const ribbon = "var(--accent)"
  const ribbonDark = "color-mix(in srgb, var(--accent) 78%, #000)"
  return (
    <svg viewBox="0 0 260 250" className={`overflow-visible ${className}`} aria-hidden="true">
      <defs>
        {gift ? (
          <pattern id={paper} width="18" height="18" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="18" height="18" style={fill("var(--wrap)")} />
            <rect width="9" height="18" style={fill("var(--wrap-shade)")} />
          </pattern>
        ) : (
          <pattern id={paper} width="26" height="26" patternUnits="userSpaceOnUse">
            <rect width="26" height="26" style={fill("var(--wrap)")} />
            <circle cx="6.5" cy="6.5" r="3.6" style={fill("var(--accent-soft)")} />
            <circle cx="19.5" cy="19.5" r="3.6" style={fill("var(--accent-soft)")} />
          </pattern>
        )}
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.22" />
        </linearGradient>
      </defs>

      {gift
        ? SPARKLES.map(([x, y, s, color], i) => <Sparkle key={i} x={x} y={y} s={s} color={color} />)
        : CONFETTI.map(([x, y, r, color], i) => (
            <rect key={i} x={x - 4} y={y - 2.5} width="8" height="5" rx="1" transform={`rotate(${r} ${x} ${y})`} style={fill(color)} />
          ))}
      {gift ? null : (
        <>
          <Balloon x={36} y={44} color="var(--accent)" tilt={-6} />
          <Balloon x={226} y={30} color="var(--accent-soft)" tilt={8} />
        </>
      )}

      {/* Shadow on the table */}
      <ellipse cx="130" cy="230" rx="100" ry="9" fill="#000" opacity="0.28" />

      {/* Box front */}
      <rect x="52" y="122" width="156" height="104" rx="3" fill={`url(#${paper})`} />
      <rect x="52" y="122" width="156" height="104" rx="3" fill={`url(#${shade})`} />
      {gift ? <rect x="118" y="122" width="24" height="104" style={fill(ribbon)} /> : null}
      <rect x="52" y="128" width="156" height="7" fill="#000" opacity="0.16" />

      {/* Lid: top seen from slightly above, then its front band */}
      <polygon points="44,100 216,100 196,80 64,80" fill={`url(#${paper})`} />
      <polygon points="44,100 216,100 196,80 64,80" fill="#fff" opacity="0.14" />
      <rect x="44" y="100" width="172" height="28" rx="3" fill={`url(#${paper})`} />
      <rect x="44" y="100" width="172" height="28" rx="3" fill={`url(#${shade})`} opacity="0.6" />
      {gift ? (
        <>
          <polygon points="116,100 144,100 138,80 122,80" style={fill(ribbon)} />
          <polygon points="57,87 203,87 209,93 51,93" style={fill(ribbonDark)} />
          <rect x="116" y="100" width="28" height="28" style={fill(ribbon)} />
          {/* Bow */}
          <g transform="translate(94 50) scale(0.6)">
            <path d="M57 50 L41 86 L49 82 L53 92 L62 54 Z" style={fill(ribbonDark)} />
            <path d="M63 50 L79 86 L71 82 L67 92 L58 54 Z" style={fill(ribbonDark)} />
            <path d="M60 50 C42 14 6 12 8 36 C10 56 42 58 60 50 Z" style={fill(ribbon)} />
            <path d="M60 50 C78 14 114 12 112 36 C110 56 78 58 60 50 Z" style={fill(ribbon)} />
            <path d="M58 48 C44 26 22 24 20 36 C26 44 44 48 58 48 Z" style={fill(ribbonDark)} opacity="0.55" />
            <path d="M62 48 C76 26 98 24 100 36 C94 44 76 48 62 48 Z" style={fill(ribbonDark)} opacity="0.55" />
            <path d="M22 30 C30 22 42 24 50 34" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" strokeLinecap="round" />
            <ellipse cx="60" cy="50" rx="10" ry="9" style={fill(ribbonDark)} />
          </g>
        </>
      ) : null}
    </svg>
  )
}
