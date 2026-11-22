// A tiny tween engine driven by the scene's render loop, as in the prototype's
// src/core/tween.js (the gift box's scene has the same one inline). No
// three.js, so it can be tested without a GPU.

export type Easing = (t: number) => number

export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inQuad: (t: number) => t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158
    const c3 = c1 + 1
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
  },
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

type Tween = { elapsed: number; duration: number; easing: Easing; onUpdate: (t: number) => void; resolve: () => void }

export function makeTweens() {
  const active: Tween[] = []
  function tween({
    duration = 1,
    delay = 0,
    easing = ease.inOutCubic,
    onUpdate,
  }: {
    duration?: number
    delay?: number
    easing?: Easing
    onUpdate: (t: number) => void
  }): Promise<void> {
    return new Promise((resolve) => active.push({ elapsed: -delay, duration: Math.max(duration, 1e-3), easing, onUpdate, resolve }))
  }
  return {
    tween,
    wait: (seconds: number) => tween({ duration: seconds, onUpdate: () => {} }),
    // Advances every tween by dt seconds; finished ones resolve.
    update(dt: number) {
      for (let i = active.length - 1; i >= 0; i--) {
        const tw = active[i]
        tw.elapsed += dt
        if (tw.elapsed < 0) continue
        const t = Math.min(tw.elapsed / tw.duration, 1)
        tw.onUpdate(tw.easing(t))
        if (t >= 1) {
          active.splice(i, 1)
          tw.resolve()
        }
      }
    },
    // On dispose: let anything awaiting a tween finish, so open() never hangs.
    flush() {
      active.splice(0).forEach((tw) => tw.resolve())
    },
    get size() {
      return active.length
    },
  }
}
