// Minimal tween engine driven by the render loop.
const active = [];

export const ease = {
  linear: (t) => t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  outElastic: (t) =>
    t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

/** Animate t from 0→1 over `duration` seconds, calling onUpdate(easedT). */
export function tween({ duration = 1, delay = 0, easing = ease.inOutCubic, onUpdate }) {
  return new Promise((resolve) => {
    active.push({ elapsed: -delay, duration, easing, onUpdate, resolve });
  });
}

export const wait = (s) => tween({ duration: s, onUpdate: () => {} });

export function updateTweens(dt) {
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i];
    tw.elapsed += dt;
    if (tw.elapsed < 0) continue;
    const t = Math.min(tw.elapsed / tw.duration, 1);
    tw.onUpdate(tw.easing(t));
    if (t >= 1) {
      active.splice(i, 1);
      tw.resolve();
    }
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
