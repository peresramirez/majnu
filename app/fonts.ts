import {
  Bricolage_Grotesque,
  Caveat,
  Cormorant_Garamond,
  EB_Garamond,
  Gilda_Display,
  Hanken_Grotesk,
  Pinyon_Script,
} from "next/font/google"

export const display = Gilda_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
})

export const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
})

// Template faces. Letters and calendars pick one of three moods (theme.font):
// serif uses Cormorant for headlines and EB Garamond to read; sans uses
// Bricolage Grotesque for headlines and the site's Hanken Grotesk to read;
// script uses Caveat throughout, with Pinyon Script for formal invitations.
// They are not preloaded, so a page only downloads the faces it shows.
export const letterSerifDisplay = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-letter-serif-display",
  display: "swap",
  preload: false,
})

export const letterSerif = EB_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-letter-serif",
  display: "swap",
  preload: false,
})

export const letterSansDisplay = Bricolage_Grotesque({
  subsets: ["latin", "latin-ext"],
  variable: "--font-letter-sans-display",
  display: "swap",
  preload: false,
})

export const letterScript = Caveat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-letter-script",
  display: "swap",
  preload: false,
})

export const letterCalligraphy = Pinyon_Script({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  variable: "--font-letter-calligraphy",
  display: "swap",
  preload: false,
})

export const letterFontVariables = [letterSerifDisplay, letterSerif, letterSansDisplay, letterScript, letterCalligraphy]
  .map((f) => f.variable)
  .join(" ")
