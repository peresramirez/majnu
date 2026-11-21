// The finder's three steps on the landing page (how-it-works.tsx), each a moon
// one phase fuller, as the moon in the pinned scene (gift-scene.tsx) travels
// from Majnu to Layla. Each step is a short title, one line, and a small
// picture of what happens (`visual`). Keep them this short: the developer asked
// for less text and more to look at, and the test holds them to it.
// A plain .ts file so the unit tests can import it (they cannot parse JSX).
export const steps = [
  {
    lit: 0.22,
    title: "Say who it is for",
    line: "Majnu guesses the rest. Change anything it gets wrong.",
    visual: "ask",
  },
  {
    lit: 0.55,
    title: "Choose from three gifts",
    line: "Real shops, real prices, and the one Majnu would pick.",
    visual: "choose",
  },
  {
    lit: 1,
    title: "Wrap it, send the link",
    line: "They open it on their phone, with nothing to install.",
    visual: "send",
  },
] as const

export type StepVisual = (typeof steps)[number]["visual"]
