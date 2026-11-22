// Pure helpers for the 3D wedding envelope: how the camera frames the envelope
// on narrow and wide screens, how the couple's names read on the card, and the
// words the card carries. No three.js here, so the template and the tests can
// import it freely. The card's size, its presented distance, text wrapping and
// the WebGL check are the gift box's (same card, same lens).
import type { LetterContent } from "@/lib/letters/schema"
import { eventDateParts, formatEventTime, type EventStart } from "../../event-time"
import { wholeName } from "../../names"
import { CARD_HEIGHT, CARD_WIDTH, FOV, hasWebGL, presentDistance, wrapLines } from "../gift-box-3d/layout"

export { CARD_HEIGHT, CARD_WIDTH, FOV, hasWebGL, presentDistance, wrapLines }

const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180)

// The envelope is 1.9 by 1.3 units, like the prototype's.
export const ENVELOPE_WIDTH = 1.9
export const ENVELOPE_HEIGHT = 1.3
// The card waits inside at this scale: 0.84 by 1.2 units, so it fits the pocket.
export const CARD_TUCKED_SCALE = 0.6

// Half the width the camera keeps in view: the envelope and some air either side.
const SCENE_HALF_WIDTH = 1.35
// The closest the camera comes, on wide screens.
const NEAREST = 5.6

function safeAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1
}

// Distance from the camera to the envelope: 5.6 units on wide screens, further
// back on tall phone screens so the envelope never meets the sides.
export function envelopeCameraDistance(aspect: number): number {
  return Math.max(NEAREST, SCENE_HALF_WIDTH / (TAN_HALF_FOV * safeAspect(aspect)))
}

// The half-width and half-height of what the camera sees at `distance`.
export function viewHalfSize(distance: number, aspect: number): { halfWidth: number; halfHeight: number } {
  const halfHeight = distance * TAN_HALF_FOV
  return { halfWidth: halfHeight * safeAspect(aspect), halfHeight }
}

// "Layla and Omar" -> "Layla & Omar", as a wedding card writes it. Also "und",
// "y", "et" and "e" between two names. A single name stays as it is.
export function coupleNames(senderName: string | null | undefined): string {
  const name = (senderName ?? "").replace(/\s+/g, " ").trim()
  return name.replace(/\s+(?:and|und|y|et|e|&|\+)\s+/i, " & ")
}

// ---------- The wax seal: one outline for the 3D seal and the drawings ----------

export type Point = [number, number]

// Points around the seal's irregular edge, on a circle of radius about 1.
const SEAL_POINTS = 48

// The edge's radius at angle `a`: a few slow ripples, like poured wax. Fixed,
// so the server and the browser draw the same seal.
function waxRadius(a: number): number {
  return 1 + 0.045 * Math.sin(5 * a + 1) + 0.03 * Math.sin(9 * a + 2) + 0.018 * Math.sin(13 * a)
}

// Point i of the edge, counter-clockwise from the top: 0 is the top, a quarter
// of the way round is the left, half way is the bottom.
function waxPoint(i: number): Point {
  const a = Math.PI / 2 + (2 * Math.PI * i) / SEAL_POINTS
  const r = waxRadius(a)
  return [r * Math.cos(a), r * Math.sin(a)]
}

// The whole edge, as a closed polygon.
export function waxOutline(): Point[] {
  return Array.from({ length: SEAL_POINTS }, (_, i) => waxPoint(i))
}

// Where the seal cracks when it breaks: a jagged line from the top of the edge
// to the bottom, inside the seal. These are the points between the two ends.
export const SEAL_CRACK: Point[] = [
  [0.07, 0.62],
  [-0.09, 0.3],
  [0.08, 0.04],
  [-0.07, -0.22],
  [0.09, -0.5],
  [-0.04, -0.76],
]

// The two halves of the broken seal, each a closed polygon, counter-clockwise.
// Together they cover the seal exactly: they share the crack.
export function sealHalves(): { left: Point[]; right: Point[] } {
  const half = SEAL_POINTS / 2
  const edge = waxOutline()
  // Top, round the left, to the bottom; then up the crack.
  const left = [...edge.slice(0, half + 1), ...[...SEAL_CRACK].reverse()]
  // Bottom, round the right, to the top; then down the crack.
  const right = [...edge.slice(half), edge[0], ...SEAL_CRACK]
  return { left, right }
}

// An SVG path for a polygon, scaled by `scale` and centred on (cx, cy), with
// y pointing down as SVG draws it.
export function svgPath(points: Point[], cx: number, cy: number, scale: number): string {
  return `${points.map(([x, y], i) => `${i ? "L" : "M"}${(cx + x * scale).toFixed(2)} ${(cy - y * scale).toFixed(2)}`).join(" ")} Z`
}

// What the 3D card says. Never a gift code: the card shows names, the headline,
// the date and the place, which the page shows anyway once it opens.
export type EnvelopeCardWords = {
  eyebrow: string
  names: string
  headline: string
  weekday: string
  date: string
  time: string
  place: string
}

// The card's words for a letter. Names fall back to the occasion, and the date
// lines stay empty for an invitation without an event.
export function cardWords(content: LetterContent, start: EventStart | null): EnvelopeCardWords {
  const parts = start ? eventDateParts(start) : null
  return {
    eyebrow: `For ${wholeName(content.recipientName)}`,
    names: coupleNames(content.senderName) || content.occasion || "You're invited",
    headline: content.headline ?? "",
    weekday: parts?.weekday ?? "",
    date: parts ? `${parts.day} ${parts.month} ${parts.year}` : "",
    time: start ? formatEventTime(start) : "",
    place: content.event?.locationName ?? "",
  }
}
