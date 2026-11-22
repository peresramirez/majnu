// Words on paper for the newer 3D templates: the page's palette and faces read
// from its CSS variables, and a small layout engine that draws centred lines
// of text on a canvas, which the scenes turn into textures. No three.js here.
import { wrapLines } from "../gift-box-3d/layout"

// Palette colours as hex strings, read from the template's CSS variables.
export type PaperColors = {
  page: string
  paper: string
  paperInk: string
  paperMuted: string
  paperAccent: string
  wrap: string
  wrapShade: string
  accent: string
  accentSoft: string
  deep: string
  deepInk: string
}

export type PaperFonts = {
  formal: string
  display: string
  displayWeight: string
  body: string
  script: boolean
}

export function readColors(el: HTMLElement): PaperColors {
  const s = getComputedStyle(el)
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback
  return {
    page: v("--page-flat", "#1E1430"),
    paper: v("--paper", "#F7F0E6"),
    paperInk: v("--paper-ink", "#2A1C3A"),
    paperMuted: v("--paper-muted", "#6E5A78"),
    paperAccent: v("--paper-accent", "#B9775A"),
    wrap: v("--wrap", "#33224A"),
    wrapShade: v("--wrap-shade", "#271A39"),
    accent: v("--accent", "#E2A98A"),
    accentSoft: v("--accent-soft", "#CD8DBD"),
    deep: v("--deep", "#33224A"),
    deepInk: v("--deep-ink", "#F7F0E6"),
  }
}

// Custom properties compute with their var() references resolved, so these
// are the real next/font family names the page itself uses.
export function readFonts(el: HTMLElement, script: boolean): PaperFonts {
  const s = getComputedStyle(el)
  return {
    formal: s.getPropertyValue("--formal").trim() || "Georgia, serif",
    display: s.getPropertyValue("--display").trim() || "Georgia, serif",
    displayWeight: s.getPropertyValue("--display-weight").trim() || "500",
    body: s.getPropertyValue("--body").trim() || "system-ui, sans-serif",
    script,
  }
}

// Waits briefly for the faces the canvas draws in, so the first texture is not
// drawn in a fallback font. Never longer than 1.5 s.
export async function loadFaces(f: PaperFonts) {
  if (typeof document === "undefined" || !document.fonts) return
  const wanted = [
    `500 96px ${f.formal}`,
    `${f.displayWeight} 96px ${f.display}`,
    `italic ${f.displayWeight} 64px ${f.display}`,
    `400 40px ${f.body}`,
    `600 32px ${f.body}`,
  ]
  const timeout = new Promise((resolve) => setTimeout(resolve, 1500))
  await Promise.race([Promise.all(wanted.map((x) => document.fonts.load(x).catch(() => null))), timeout])
}

export type Block =
  | { kind: "text"; text: string; font: string; color: string; lineHeight: number; maxLines?: number; spacing?: string; upper?: boolean }
  | { kind: "gap"; height: number }
  | { kind: "rule"; color: string; width: number }

// Draws the blocks centred horizontally at `cx`, the whole stack centred
// vertically between `top` and `bottom`, each line wrapped to `maxWidth`.
export function drawStack(ctx: CanvasRenderingContext2D, blocks: Block[], cx: number, top: number, bottom: number, maxWidth: number) {
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  // Canvas letter spacing is newer than the rest; skip it where it is missing.
  const spaced = ctx as CanvasRenderingContext2D & { letterSpacing?: string }
  const canSpace = "letterSpacing" in spaced
  const laid = blocks.map((b) => {
    if (b.kind !== "text") return { b, lines: [] as string[] }
    ctx.font = b.font
    if (canSpace) spaced.letterSpacing = b.spacing ?? "0px"
    const value = b.upper ? b.text.toUpperCase() : b.text
    return { b, lines: value.trim() ? wrapLines(value, maxWidth, (s) => ctx.measureText(s).width, b.maxLines ?? 3) : [] }
  })
  const heightOf = ({ b, lines }: (typeof laid)[number]) => (b.kind === "text" ? lines.length * b.lineHeight : b.kind === "gap" ? b.height : 20)
  const total = laid.reduce((sum, l) => sum + heightOf(l), 0)
  let y = top + Math.max(0, (bottom - top - total) / 2)
  for (const l of laid) {
    const b = l.b
    if (b.kind === "text") {
      ctx.font = b.font
      ctx.fillStyle = b.color
      if (canSpace) spaced.letterSpacing = b.spacing ?? "0px"
      for (const line of l.lines) {
        ctx.fillText(line, cx, y + b.lineHeight / 2)
        y += b.lineHeight
      }
    } else if (b.kind === "gap") {
      y += b.height
    } else {
      const mid = y + 10
      ctx.strokeStyle = b.color
      ctx.fillStyle = b.color
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(cx - b.width / 2, mid)
      ctx.lineTo(cx - 22, mid)
      ctx.moveTo(cx + 22, mid)
      ctx.lineTo(cx + b.width / 2, mid)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(cx, mid - 10)
      ctx.lineTo(cx + 10, mid)
      ctx.lineTo(cx, mid + 10)
      ctx.lineTo(cx - 10, mid)
      ctx.fill()
      y += 20
    }
  }
  if (canSpace) spaced.letterSpacing = "0px"
}

// A canvas of the given size, filled with paper and a soft vignette.
export function paperCanvas(width: number, height: number, color: string): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")!
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  const v = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.2, width / 2, height / 2, Math.max(width, height) * 0.8)
  v.addColorStop(0, "rgba(0,0,0,0)")
  v.addColorStop(1, "rgba(0,0,0,0.09)")
  ctx.fillStyle = v
  ctx.fillRect(0, 0, width, height)
  return { canvas, ctx }
}
