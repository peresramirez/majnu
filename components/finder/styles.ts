// Class names shared by the finder and the hero (Night Post, docs/brand.md).
export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-rose"

// Rose gold means "this is the thing to do": one per screen where possible.
export const primaryButton = `inline-flex items-center justify-center gap-2 rounded-full bg-night-rose px-5 py-3 text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] aria-disabled:cursor-not-allowed aria-disabled:opacity-60 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`

export const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold text-night-petal ring-1 ring-inset ring-night-petal/25 transition-colors duration-200 ease-calm hover:ring-night-petal/50 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`

export const smallPrimary = `inline-flex items-center justify-center gap-1.5 rounded-full bg-night-rose px-4 py-2 text-sm font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`

export const smallButton = `inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-night-petal ring-1 ring-inset ring-night-petal/20 transition-colors duration-200 ease-calm hover:ring-night-petal/45 disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`

// Tappable answers and suggestions.
export const chip = `inline-flex min-h-[40px] items-center rounded-full bg-night-petal/[0.04] px-4 py-2 text-left text-sm font-medium text-night-petal ring-1 ring-inset ring-night-petal/20 transition-colors duration-200 ease-calm hover:bg-night-petal/10 hover:ring-night-petal/40 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

export const textLink = `rounded font-semibold text-night-rose underline decoration-night-rose/40 underline-offset-4 transition-colors hover:decoration-night-rose ${focusRing}`

// Links that are not the main action: petal, not rose gold.
export const quietLink = `rounded font-medium text-night-petal underline decoration-night-petal/30 underline-offset-4 transition-colors hover:decoration-night-petal/70 ${focusRing}`

export const eyebrow = "text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac"
