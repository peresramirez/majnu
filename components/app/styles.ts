// Shared class names for the signed-in app (Night Post, docs/brand.md).
export const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-rose"

// Rose gold means "this is the thing to do": one per screen where possible.
export const primaryButton = `inline-flex items-center justify-center gap-2 rounded-full bg-night-rose px-5 py-3 text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

export const secondaryButton = `inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[15px] font-semibold text-night-petal ring-1 ring-inset ring-night-petal/25 transition-colors duration-200 ease-calm hover:ring-night-petal/50 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

// Smaller actions inside cards and toolbars.
export const smallButton = `inline-flex items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold text-night-petal ring-1 ring-inset ring-night-petal/20 transition-colors duration-200 ease-calm hover:ring-night-petal/45 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`

export const eyebrow = "text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac"

// Content pages (My gifts, Plan) share the same padding; pick a width with it.
export const pagePadding = "mx-auto w-full px-4 pb-10 pt-8 sm:px-6 md:pb-16 md:pt-12"
export const pageContainer = `max-w-5xl ${pagePadding}`
