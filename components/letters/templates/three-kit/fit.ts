// Pure framing sums shared by the three newer 3D templates (wedding-invite-3d,
// party-invite-3d and gift-3d). No three.js, so the tests import it freely.

// The camera's vertical field of view, in degrees.
export const FOV = 38
const TAN_HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180)

function safeAspect(aspect: number): number {
  return Number.isFinite(aspect) && aspect > 0.2 ? aspect : 1
}

// How far back the camera stands so an object `halfWidth` by `halfHeight`
// units either side of the middle fits the view, never closer than `nearest`.
// Tall phone screens are limited by width, wide ones by height.
export function fitDistance(halfWidth: number, halfHeight: number, aspect: number, nearest = 0): number {
  const byHeight = halfHeight / TAN_HALF_FOV
  const byWidth = halfWidth / (TAN_HALF_FOV * safeAspect(aspect))
  return Math.max(nearest, byHeight, byWidth)
}

// The device pixel ratio the renderer draws at: sharp on a phone, but never
// above 2, and lower on small screens with a high ratio, which are also the
// slowest GPUs. Keeps a 60 fps target on a mid phone.
export function renderPixelRatio(devicePixelRatio: number, cssWidth: number): number {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1
  const cap = cssWidth < 500 ? 1.75 : 2
  return Math.min(dpr, cap)
}

// A smooth 0..1 ramp of `t` between `a` and `b`.
export function ramp(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return x * x * (3 - 2 * x)
}
