// Pure helpers for the 3D gift box (gift-box-3d and party-box): how the camera
// frames the box on narrow and wide screens, where the card stops in front of
// it, how the card's words wrap, and whether the browser can draw 3D at all.
// No three.js here, so the template and the tests can import it freely.

export type BoxMood = "gift" | "party"

// The camera's vertical field of view, in degrees.
export const FOV = 40
const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180)

// The box and its lid span about this many units either side of the middle;
// the camera stands back far enough to fit them with some air.
const SCENE_HALF_WIDTH = 1.7
// The closest the camera comes, on wide screens.
const NEAREST = 6.3
// The card is 1.4 by 2.0 units.
export const CARD_WIDTH = 1.4
export const CARD_HEIGHT = 2.0

function safeAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1
}

// Distance from the camera to the box: 6.3 units on wide screens, further back
// on tall phone screens so nothing is cut off at the sides.
export function cameraDistance(aspect: number): number {
  return Math.max(NEAREST, SCENE_HALF_WIDTH / (TAN_HALF_FOV * safeAspect(aspect)))
}

// How far in front of the camera the card stops when it is presented: as close
// as it can come while staying under 80% of the view's height and 86% of its
// width.
export function presentDistance(aspect: number): number {
  const byHeight = CARD_HEIGHT / (0.8 * 2 * TAN_HALF_FOV)
  const byWidth = CARD_WIDTH / (0.86 * 2 * TAN_HALF_FOV * safeAspect(aspect))
  return Math.max(byHeight, byWidth)
}

// Greedy word wrap for text drawn on a canvas. `measure` returns the width of a
// string in the current font. A word longer than the line is kept whole on its
// own line rather than cut. With `maxLines`, the last line ends in an ellipsis.
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines = Infinity): string[] {
  const words = (text ?? "").trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.includes(" ") && measure(`${last}…`) > maxWidth) last = last.slice(0, last.lastIndexOf(" "))
  kept[maxLines - 1] = `${last}…`
  return kept
}

// True when this browser can give us a WebGL context. The test context is
// released straight away, because phones allow only a few at a time.
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas")
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGLRenderingContext | null
    if (!gl) return false
    gl.getExtension("WEBGL_lose_context")?.loseContext()
    return true
  } catch {
    return false
  }
}
