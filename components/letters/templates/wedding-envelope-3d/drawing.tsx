// The 3D wedding envelope as still drawings, in the page's palette. The sealed
// envelope is what the server renders, what shows while three.js loads, the
// whole picture with reduced motion or without WebGL, and the template's
// thumbnail. The broken seal heads the page once the invitation is open. No
// hooks, so <TemplateCard> can render them on the server; `idPrefix` keeps the
// SVG ids unique on a page.
import type { CSSProperties } from "react"
import { sealHalves, svgPath, waxOutline } from "./layout"

const fill = (value: string): CSSProperties => ({ fill: value })

// The envelope sits in a 280 by 230 box: 220 by 150, like the 3D one (1.9 by
// 1.3 units, so 115.4 to the unit), with room for petals and a shadow.
const X = 30
const Y = 48
const W = 220
const H = 150
const U = H / 1.3
const CX = X + W / 2
// The flap's tip and the seal on it, as in the scene.
const TIP_Y = Y + 0.78 * U
const SEAL_Y = Y + 0.72 * U
const SEAL_R = 0.17 * U

// Petals around the envelope: [x, y, rotation, scale, colour].
const PETALS: [number, number, number, number, string][] = [
  [22, 28, -30, 1.1, "var(--accent-soft)"],
  [74, 14, 40, 0.8, "var(--accent)"],
  [212, 22, 15, 1, "var(--accent-soft)"],
  [262, 64, -50, 0.9, "color-mix(in srgb, var(--accent-soft) 55%, var(--paper))"],
  [14, 150, 60, 0.85, "color-mix(in srgb, var(--accent-soft) 55%, var(--paper))"],
  [266, 176, -20, 1.05, "var(--accent)"],
  [150, 12, 80, 0.7, "color-mix(in srgb, var(--accent) 60%, var(--paper))"],
]

function Petal({ x, y, r, s, color }: { x: number; y: number; r: number; s: number; color: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
      <path d="M0 -8 C 7 -4.5 7.5 4.5 0 8.5 C -7.5 4.5 -7 -4.5 0 -8 Z" style={fill(color)} opacity="0.9" />
      <path d="M0 -6 C 1.2 -1 1 3 0 6.5" fill="none" stroke="#fff" strokeOpacity="0.28" strokeWidth="0.8" />
    </g>
  )
}

// The wax: a gradient of the paper accent, lit from the top left.
function WaxGradient({ id }: { id: string }) {
  return (
    <radialGradient id={id} cx="36%" cy="30%" r="78%">
      <stop offset="0%" style={{ stopColor: "color-mix(in srgb, var(--paper-accent) 62%, #fff)" }} />
      <stop offset="48%" style={{ stopColor: "var(--paper-accent)" }} />
      <stop offset="100%" style={{ stopColor: "color-mix(in srgb, var(--paper-accent) 58%, #000)" }} />
    </radialGradient>
  )
}

const sealInk = "color-mix(in srgb, var(--paper-accent) 50%, #000)"
const sealLight = "color-mix(in srgb, var(--paper-accent) 55%, #fff)"

export function EnvelopeDrawing({ initials, idPrefix, className = "" }: { initials: string; idPrefix: string; className?: string }) {
  const wax = `${idPrefix}-wax`
  const shade = `${idPrefix}-shade`
  const flapShade = `${idPrefix}-flap`
  const flap = `M${X} ${Y} L${X + W} ${Y} Q${CX + 0.15 * U} ${Y + 0.7 * U} ${CX} ${TIP_Y} Q${CX - 0.15 * U} ${Y + 0.7 * U} ${X} ${Y} Z`
  return (
    <svg viewBox="0 0 280 230" className={`overflow-visible ${className}`} aria-hidden="true">
      <defs>
        <WaxGradient id={wax} />
        <linearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={flapShade} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.02" />
          <stop offset="1" stopColor="#000" stopOpacity="0.1" />
        </linearGradient>
      </defs>

      {PETALS.map(([x, y, r, s, color], i) => (
        <Petal key={i} x={x} y={y} r={r} s={s} color={color} />
      ))}

      {/* Shadow under the floating envelope */}
      <ellipse cx={CX} cy="218" rx="92" ry="6" fill="#000" opacity="0.22" />

      {/* The envelope's face, its folds and gold edge */}
      <rect x={X} y={Y} width={W} height={H} rx="2" style={fill("var(--paper)")} />
      <rect x={X} y={Y} width={W} height={H} rx="2" fill={`url(#${shade})`} />
      <path
        d={`M${X} ${Y + H} L${CX} ${Y + 0.71 * U} L${X + W} ${Y + H}`}
        fill="none"
        stroke="var(--paper-accent)"
        strokeOpacity="0.4"
        strokeWidth="0.9"
      />
      <rect x={X + 0.5} y={Y + 0.5} width={W - 1} height={H - 1} rx="2" fill="none" stroke="var(--paper-accent)" strokeOpacity="0.55" strokeWidth="1" />

      {/* The flap, closed, and the seal on its tip */}
      <path d={flap} style={fill("var(--paper)")} />
      <path d={flap} fill={`url(#${flapShade})`} stroke="var(--paper-accent)" strokeOpacity="0.6" strokeWidth="1" strokeLinejoin="round" />
      <g style={{ filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.3))" }}>
        <path d={svgPath(waxOutline(), CX, SEAL_Y, SEAL_R)} fill={`url(#${wax})`} />
      </g>
      <circle cx={CX} cy={SEAL_Y} r={SEAL_R * 0.7} fill="none" stroke={sealInk} strokeOpacity="0.5" strokeWidth="1.1" />
      <SealInitials initials={initials} x={CX} y={SEAL_Y} size={SEAL_R * (initials.length > 1 ? 0.62 : 0.9)} />
    </svg>
  )
}

function SealInitials({ initials, x, y, size }: { initials: string; x: number; y: number; size: number }) {
  const style: CSSProperties = { fontFamily: "var(--formal)", fontSize: size }
  return (
    <g>
      <text x={x - 0.7} y={y - 0.7} textAnchor="middle" dominantBaseline="central" style={{ ...style, fill: sealLight }} opacity="0.8">
        {initials}
      </text>
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central" style={{ ...style, fill: sealInk }}>
        {initials}
      </text>
    </g>
  )
}

// The seal the visitor broke: two halves along the crack, a little apart, as
// if they had just fallen on the table. Heads the open invitation.
export function BrokenSeal({ initials, idPrefix, className = "" }: { initials: string; idPrefix: string; className?: string }) {
  const wax = `${idPrefix}-broken-wax`
  const { left, right } = sealHalves()
  const r = 34
  const size = r * (initials.length > 1 ? 0.62 : 0.9)
  // Each half clips its own copy of the ring and the initials, so the
  // monogram breaks with the wax.
  const half = (points: typeof left, key: string, transform: string) => (
    <g key={key} transform={transform}>
      <clipPath id={`${idPrefix}-${key}`}>
        <path d={svgPath(points, 60, 40, r)} />
      </clipPath>
      <path d={svgPath(points, 60, 40, r)} fill={`url(#${wax})`} />
      <g clipPath={`url(#${idPrefix}-${key})`}>
        <circle cx="60" cy="40" r={r * 0.7} fill="none" stroke={sealInk} strokeOpacity="0.5" strokeWidth="1.6" />
        <SealInitials initials={initials} x={60} y={40} size={size} />
      </g>
    </g>
  )
  return (
    <svg viewBox="0 0 120 80" className={`overflow-visible ${className}`} aria-hidden="true">
      <defs>
        <WaxGradient id={wax} />
      </defs>
      <g style={{ filter: "drop-shadow(0 4px 5px rgba(0,0,0,0.3))" }}>
        {half(left, "left", "translate(-7 3) rotate(-9 60 40)")}
        {half(right, "right", "translate(7 -1) rotate(8 60 40)")}
      </g>
    </svg>
  )
}
