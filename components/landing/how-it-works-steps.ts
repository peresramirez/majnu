// The finder's three steps on the landing page (how-it-works.tsx), told one at
// a time while the section is pinned, as the moon in the scene (gift-scene.tsx)
// travels from Majnu to Layla. Each step is a short title and one line; `lit`
// is its moon phase in the progress marks, one phase fuller per step. Keep them
// this short: the developer asked for less text, and the test holds them to it.
// A plain .ts file so the unit tests can import it (they cannot parse JSX).
export const steps = [
  {
    lit: 0.22,
    title: "Say who it is for",
    line: "Add their Instagram, TikTok or LinkedIn. Majnu builds their profile.",
  },
  {
    lit: 0.55,
    title: "Choose from six gifts",
    line: "Tap through a few questions. Real shops, real prices, Majnu’s pick.",
  },
  {
    lit: 1,
    title: "Wrap it, send the link",
    line: "They open it on their phone, with nothing to install.",
  },
] as const

// The story's timeline, measured in steps of scroll: 0 is where the section
// pins (its top reaches the top of the screen) and steps.length is where it lets
// go. One step of scroll is SCREENS_PER_STEP of the screen's height, so the
// section is one screen tall plus steps.length × SCREENS_PER_STEP screens.
// how-it-works.tsx writes the current position as `--u`; app/globals.css turns
// it into each letter's movement.
export const SCREENS_PER_STEP = 0.8

// An entrance or an exit takes SPAN steps of scroll. Its letters go one after
// another: each takes GLYPH, and the last starts SPAN - GLYPH after the first.
export const SPAN = 0.36
export const GLYPH = 0.22

// Where one step gives way to the next. The old step starts leaving HALF before
// it and is gone OVERLAP after it; the new one starts arriving OVERLAP before it
// and has settled HALF after it. Placed so each step rests about as long.
const CHANGES = [0.92, 2.08]
const OVERLAP = 0.06
const HALF = SPAN - OVERLAP

// `enter` and `leave` are where the step's entrance and exit begin; the last
// step never leaves (the section scrolls away with it). The first settles just
// before the section pins, while it scrolls into view.
export const windows = steps.map((_, k) => ({
  enter: k === 0 ? -SPAN - 0.04 : CHANGES[k - 1] - OVERLAP,
  leave: k < CHANGES.length ? CHANGES[k] - HALF : null,
}))

// The position one step (or its progress mark) needs to look right at story
// position `u`. Outside its entrance and exit nothing about it changes, so the
// value stops changing too, and how-it-works.tsx skips the style write: only a
// step that is moving costs the browser any work.
export function stepPosition(u: number, k: number) {
  const { enter, leave } = windows[k]
  if (u <= enter) return enter
  if (u < enter + SPAN) return u
  if (leave === null || u <= leave) return enter + SPAN
  return Math.min(u, leave + SPAN)
}

// Where the moon is on its way from Majnu's hands (0) to Layla's palm (1), at
// points of the timeline. The scene reads them from marks the section places in
// the page (data-moon). It starts as the section comes into view from below,
// is on its way when the first step pins, at the top of its arc as the second
// settles, and lands, full, as the last one settles.
export const moonMarks = [
  { at: -1 / SCREENS_PER_STEP, t: 0 },
  { at: 0, t: 0.2 },
  ...steps.slice(1).map((_, i) => ({ at: windows[i + 1].enter + SPAN, t: (i + 1) / (steps.length - 1) })),
]
