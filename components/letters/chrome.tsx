// Small pieces every template shares. No hooks, so they render on the server.
import type { CSSProperties } from "react"

// A faint paper grain, drawn by the browser from an inline SVG. No image request.
export const paperGrain =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .07 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")"

export const paperStyle: CSSProperties = {
  backgroundColor: "var(--paper)",
  backgroundImage: paperGrain,
  color: "var(--paper-ink)",
}

export const displayStyle: CSSProperties = {
  fontFamily: "var(--display)",
  fontWeight: "var(--display-weight)" as CSSProperties["fontWeight"],
}

export const bodyStyle: CSSProperties = {
  fontFamily: "var(--body)",
  fontSize: "var(--body-size)",
  lineHeight: "var(--body-leading)" as CSSProperties["lineHeight"],
}

export const signOffStyle: CSSProperties = {
  fontFamily: "var(--display)",
  fontStyle: "var(--signoff-style)" as CSSProperties["fontStyle"],
}

export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"

// Sparse, still stars for dark palettes. Positions are fixed so the server and
// the browser draw the same sky.
const STARS = [
  [6, 8, 1.5], [18, 22, 1], [29, 6, 1], [41, 15, 2], [55, 4, 1], [64, 19, 1], [77, 9, 1.5], [91, 14, 1],
  [12, 41, 1], [86, 37, 1.5], [4, 63, 1], [95, 58, 1], [24, 79, 1.5], [71, 84, 1], [48, 92, 1], [88, 76, 1],
] as const

export function Stars({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {STARS.map(([x, y, r], i) => (
        <span
          key={i}
          className="absolute rounded-full bg-[var(--page-ink)]"
          style={{ left: `${x}%`, top: `${y}%`, width: r * 2, height: r * 2, opacity: 0.18 + (i % 4) * 0.1 }}
        />
      ))}
    </div>
  )
}

// The quiet credit at the end of every gift: the brand mark (from
// public/brand, never retyped) and a link home, so a recipient can make one too.
export function MadeWith({ className = "" }: { className?: string }) {
  return (
    <a
      href="/"
      className={`mx-auto mt-14 flex w-fit items-center gap-2 rounded-full px-3 py-2 font-sans text-[13px] tracking-wide opacity-70 transition-opacity duration-300 hover:opacity-100 ${focusRing} ${className}`}
    >
      <span
        aria-hidden="true"
        className="inline-block h-4 w-4 bg-current"
        style={{
          maskImage: "url(/brand/majnu-mark-mono.svg)",
          WebkitMaskImage: "url(/brand/majnu-mark-mono.svg)",
          maskSize: "contain",
          WebkitMaskSize: "contain",
          maskRepeat: "no-repeat",
          WebkitMaskRepeat: "no-repeat",
        }}
      />
      Made with Majnu
    </a>
  )
}

// A short rule with a small diamond in the middle.
export function Ornament({ className = "", align = "center" }: { className?: string; align?: "center" | "start" }) {
  return (
    <div aria-hidden="true" className={`flex items-center gap-3 ${align === "start" ? "justify-start" : "justify-center"} ${className}`}>
      <span className="h-px w-12 bg-current opacity-30" />
      <span className="h-1.5 w-1.5 rotate-45 bg-current opacity-60" />
      <span className="h-px w-12 bg-current opacity-30" />
    </div>
  )
}
