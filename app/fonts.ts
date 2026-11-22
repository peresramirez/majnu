import localFont from "next/font/local"

// Every face is a file committed in app/fonts/files/, so the build never calls
// Google Fonts. The files are the faces, weights and subsets these exports once
// asked next/font/google for, cut the way Google cuts them (app/fonts/build.py
// makes them; LICENSES.md names each font, its license and its source).
//
// next/font only accepts written-out literals here, which is why the paths and
// unicode ranges repeat.

// Headlines: Gilda Display, latin. Its license reserves the name "Gilda" for
// unmodified copies, so the subset is called Majnu Display inside the file.
export const display = localFont({
  src: [{ path: "./fonts/files/gilda-display-latin.woff2", weight: "400", style: "normal" }],
  variable: "--font-display",
  display: "swap",
  adjustFontFallback: "Times New Roman",
})

// Everything people read and tap: Hanken Grotesk, latin. One variable file
// serves all three weights, as it did from Google.
export const sans = localFont({
  src: [
    { path: "./fonts/files/hanken-grotesk-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/files/hanken-grotesk-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/files/hanken-grotesk-latin.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
})

// Template faces. Letters and calendars pick one of three moods (theme.font):
// serif uses Cormorant for headlines and EB Garamond to read; sans uses
// Bricolage Grotesque for headlines and the site's Hanken Grotesk to read;
// script uses Caveat throughout, with Pinyon Script for formal invitations.
// They are not preloaded, so a page only downloads the faces it shows.
//
// Each template face comes in two files, latin and latin-ext, declared as one
// font family with a unicode-range each (as Google's own CSS does), so the
// latin-ext file is only downloaded for a letter that uses one of its letters.
// The latin-ext half is its own localFont call, because next/font/local gives
// every file of a call the same declarations.
export const letterSerifDisplay = localFont({
  src: [
    { path: "./fonts/files/cormorant-garamond-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/files/cormorant-garamond-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/files/cormorant-garamond-italic-latin.woff2", weight: "500", style: "italic" },
    { path: "./fonts/files/cormorant-garamond-italic-latin.woff2", weight: "600", style: "italic" },
  ],
  declarations: [
    { prop: "font-family", value: "letterSerifDisplay" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-letter-serif-display",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
})

const letterSerifDisplayLatinExt = localFont({
  src: [
    { path: "./fonts/files/cormorant-garamond-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "./fonts/files/cormorant-garamond-latin-ext.woff2", weight: "600", style: "normal" },
    { path: "./fonts/files/cormorant-garamond-italic-latin-ext.woff2", weight: "500", style: "italic" },
    { path: "./fonts/files/cormorant-garamond-italic-latin-ext.woff2", weight: "600", style: "italic" },
  ],
  declarations: [
    { prop: "font-family", value: "letterSerifDisplay" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  variable: "--font-letter-serif-display-latin-ext",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
})

export const letterSerif = localFont({
  src: [
    { path: "./fonts/files/eb-garamond-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/files/eb-garamond-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/files/eb-garamond-italic-latin.woff2", weight: "400", style: "italic" },
    { path: "./fonts/files/eb-garamond-italic-latin.woff2", weight: "500", style: "italic" },
  ],
  declarations: [
    { prop: "font-family", value: "letterSerif" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-letter-serif",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
})

const letterSerifLatinExt = localFont({
  src: [
    { path: "./fonts/files/eb-garamond-latin-ext.woff2", weight: "400", style: "normal" },
    { path: "./fonts/files/eb-garamond-latin-ext.woff2", weight: "500", style: "normal" },
    { path: "./fonts/files/eb-garamond-italic-latin-ext.woff2", weight: "400", style: "italic" },
    { path: "./fonts/files/eb-garamond-italic-latin-ext.woff2", weight: "500", style: "italic" },
  ],
  declarations: [
    { prop: "font-family", value: "letterSerif" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  variable: "--font-letter-serif-latin-ext",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
})

export const letterSansDisplay = localFont({
  src: [{ path: "./fonts/files/bricolage-grotesque-latin.woff2", weight: "200 800", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "letterSansDisplay" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-letter-sans-display",
  display: "swap",
  preload: false,
})

const letterSansDisplayLatinExt = localFont({
  src: [{ path: "./fonts/files/bricolage-grotesque-latin-ext.woff2", weight: "200 800", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "letterSansDisplay" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  variable: "--font-letter-sans-display-latin-ext",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
})

export const letterScript = localFont({
  src: [{ path: "./fonts/files/caveat-latin.woff2", weight: "400 700", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "letterScript" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-letter-script",
  display: "swap",
  preload: false,
})

const letterScriptLatinExt = localFont({
  src: [{ path: "./fonts/files/caveat-latin-ext.woff2", weight: "400 700", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "letterScript" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  variable: "--font-letter-script-latin-ext",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
})

export const letterCalligraphy = localFont({
  src: [{ path: "./fonts/files/pinyon-script-latin.woff2", weight: "400", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "letterCalligraphy" },
    {
      prop: "unicode-range",
      value:
        "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0300-0301, U+0303-0304, U+0308-0309, U+0323, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD",
    },
  ],
  variable: "--font-letter-calligraphy",
  display: "swap",
  preload: false,
})

const letterCalligraphyLatinExt = localFont({
  src: [{ path: "./fonts/files/pinyon-script-latin-ext.woff2", weight: "400", style: "normal" }],
  declarations: [
    { prop: "font-family", value: "letterCalligraphy" },
    {
      prop: "unicode-range",
      value:
        "U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C4, U+2113, U+2C60-2C7F, U+A720-A7FF",
    },
  ],
  variable: "--font-letter-calligraphy-latin-ext",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
})

// The latin-ext halves are listed too: their classes only set an unused
// variable, but naming them here keeps their @font-face rules in the CSS
// (next/font drops a font call nothing uses).
export const letterFontVariables = [
  letterSerifDisplay,
  letterSerifDisplayLatinExt,
  letterSerif,
  letterSerifLatinExt,
  letterSansDisplay,
  letterSansDisplayLatinExt,
  letterScript,
  letterScriptLatinExt,
  letterCalligraphy,
  letterCalligraphyLatinExt,
]
  .map((f) => f.variable)
  .join(" ")
