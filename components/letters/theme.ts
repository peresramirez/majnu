// What each palette and font mood looks like in the templates. The contract
// only names moods (lib/letters/schema.ts); the colours and faces live here.
// Templates read the values as CSS variables, set once on the renderer's root,
// so a template never branches on the palette name.
import type { CSSProperties } from "react"
import type { Theme } from "@/lib/letters/schema"

export type PaletteName = Theme["palette"]
export type FontName = Theme["font"]

type Palette = {
  // Page ground behind the paper. A CSS background value.
  page: string
  // A flat colour close to the page, for the browser bar and overscroll.
  pageFlat: string
  pageInk: string
  pageMuted: string
  // Letter paper, cards, the inside of doors.
  paper: string
  paperInk: string
  paperMuted: string
  line: string
  // The one warm thing on the page: seal, ribbon, primary button.
  accent: string
  accentInk: string
  // A second, quieter colour for patterns and shading.
  accentSoft: string
  // The accent as it shows on paper: ornaments, rules, links.
  paperAccent: string
  // A deep surface that carries light text on paper: gift card faces,
  // buttons inside a card. A CSS background value.
  deep: string
  deepInk: string
  // Envelope, wrapping paper and closed doors.
  wrap: string
  wrapShade: string
  wrapInk: string
  dark: boolean
}

export const palettes: Record<PaletteName, Palette> = {
  // Deep plum and rose gold: a letter opened at night.
  night: {
    page: "radial-gradient(120% 90% at 70% 0%, #3E2759 0%, #1B1226 55%, #100A17 100%)",
    pageFlat: "#1B1226",
    pageInk: "#F5EAF1",
    pageMuted: "#BCA8C4",
    paper: "#F7F0E6",
    paperInk: "#2A1C3A",
    paperMuted: "#6E5A78",
    line: "rgba(42, 28, 58, 0.16)",
    accent: "#E2A98A",
    accentInk: "#1B1226",
    accentSoft: "#CD8DBD",
    paperAccent: "#B9775A",
    deep: "linear-gradient(140deg, #46305F 0%, #2A1C3A 55%, #1B1226 100%)",
    deepInk: "#F5EAF1",
    wrap: "#33224A",
    wrapShade: "#271A39",
    wrapInk: "#F5EAF1",
    dark: true,
  },
  // Soft pink and white: light, sweet, a little giddy.
  petal: {
    page: "linear-gradient(180deg, #FDF3F6 0%, #F8DCE6 100%)",
    pageFlat: "#FBE8EE",
    pageInk: "#46182F",
    pageMuted: "#875A70",
    paper: "#FFFFFF",
    paperInk: "#3A1528",
    paperMuted: "#86627A",
    line: "rgba(70, 24, 47, 0.12)",
    accent: "#D9577F",
    accentInk: "#FFFFFF",
    accentSoft: "#F4A9C0",
    paperAccent: "#C94A73",
    deep: "linear-gradient(140deg, #E0698F 0%, #C2456E 100%)",
    deepInk: "#FFFFFF",
    wrap: "#F6C3D3",
    wrapShade: "#EDAFC3",
    wrapInk: "#46182F",
    dark: false,
  },
  // Warm blush: terracotta skin tones, a deep rose ribbon.
  rose: {
    page: "linear-gradient(170deg, #F6DED2 0%, #EBC2B1 100%)",
    pageFlat: "#F1D2C4",
    pageInk: "#4A1F18",
    pageMuted: "#87554A",
    paper: "#FFF8F3",
    paperInk: "#46201A",
    paperMuted: "#8A6056",
    line: "rgba(74, 31, 24, 0.13)",
    accent: "#A8384E",
    accentInk: "#FFF8F3",
    accentSoft: "#E39A8D",
    paperAccent: "#A8384E",
    deep: "linear-gradient(140deg, #B9485C 0%, #8E2B40 100%)",
    deepInk: "#FFF8F3",
    wrap: "#E9A99B",
    wrapShade: "#DC9585",
    wrapInk: "#4A1F18",
    dark: false,
  },
  // Muted green and cream: garden paper, pressed leaves.
  sage: {
    page: "linear-gradient(175deg, #E3E8DA 0%, #CBD4BE 100%)",
    pageFlat: "#D8DFCD",
    pageInk: "#25301F",
    pageMuted: "#5B6853",
    paper: "#FBF7EC",
    paperInk: "#28321F",
    paperMuted: "#69735D",
    line: "rgba(37, 48, 31, 0.14)",
    accent: "#56704A",
    accentInk: "#FBF7EC",
    accentSoft: "#C7A878",
    paperAccent: "#56704A",
    deep: "linear-gradient(140deg, #627D55 0%, #435A39 100%)",
    deepInk: "#FBF7EC",
    wrap: "#A9B897",
    wrapShade: "#97A884",
    wrapInk: "#25301F",
    dark: false,
  },
  // Black and white, formal: engraved card on a dark table.
  ink: {
    page: "radial-gradient(110% 80% at 50% 0%, #2A2A2A 0%, #121212 60%, #0A0A0A 100%)",
    pageFlat: "#121212",
    pageInk: "#F4F2EE",
    pageMuted: "#A6A29B",
    paper: "#FCFBF7",
    paperInk: "#141414",
    paperMuted: "#5E5B55",
    line: "rgba(20, 20, 20, 0.22)",
    accent: "#F4F2EE",
    accentInk: "#141414",
    accentSoft: "#8E8A83",
    paperAccent: "#141414",
    deep: "linear-gradient(140deg, #2B2B2B 0%, #101010 100%)",
    deepInk: "#FCFBF7",
    wrap: "#202020",
    wrapShade: "#181818",
    wrapInk: "#F4F2EE",
    dark: true,
  },
}

type FontMood = {
  display: string
  body: string
  // Formal display face for invitations. Only script differs.
  formal: string
  bodySize: string
  bodyLeading: string
  displayWeight: number
  // Script faces have no italic; the others sign off in italic.
  signOffStyle: "italic" | "normal"
}

const serifDisplay = "var(--font-letter-serif-display), 'Cormorant Garamond', Georgia, serif"
const serifBody = "var(--font-letter-serif), 'EB Garamond', Georgia, serif"
const sansDisplay = "var(--font-letter-sans-display), 'Bricolage Grotesque', system-ui, sans-serif"
const sansBody = "var(--font-sans), system-ui, sans-serif"
const script = "var(--font-letter-script), 'Caveat', 'Bradley Hand', cursive"

export const fonts: Record<FontName, FontMood> = {
  serif: {
    display: serifDisplay,
    body: serifBody,
    formal: serifDisplay,
    bodySize: "19px",
    bodyLeading: "1.65",
    displayWeight: 500,
    signOffStyle: "italic",
  },
  sans: {
    display: sansDisplay,
    body: sansBody,
    formal: sansDisplay,
    bodySize: "17px",
    bodyLeading: "1.65",
    displayWeight: 600,
    signOffStyle: "normal",
  },
  script: {
    display: script,
    body: script,
    formal: "var(--font-letter-calligraphy), 'Pinyon Script', cursive",
    bodySize: "23px",
    bodyLeading: "1.4",
    displayWeight: 600,
    signOffStyle: "normal",
  },
}

export function paletteOf(theme: Partial<Theme> | undefined): Palette {
  return palettes[theme?.palette as PaletteName] ?? palettes.night
}

export function fontOf(theme: Partial<Theme> | undefined): FontMood {
  return fonts[theme?.font as FontName] ?? fonts.serif
}

// The CSS variables a template reads, e.g. `bg-[var(--paper)]`.
export function themeStyle(theme: Partial<Theme> | undefined): CSSProperties {
  const p = paletteOf(theme)
  const f = fontOf(theme)
  return {
    "--page": p.page,
    "--page-flat": p.pageFlat,
    "--page-ink": p.pageInk,
    "--page-muted": p.pageMuted,
    "--paper": p.paper,
    "--paper-ink": p.paperInk,
    "--paper-muted": p.paperMuted,
    "--line": p.line,
    "--accent": p.accent,
    "--accent-ink": p.accentInk,
    "--accent-soft": p.accentSoft,
    "--paper-accent": p.paperAccent,
    "--deep": p.deep,
    "--deep-ink": p.deepInk,
    "--wrap": p.wrap,
    "--wrap-shade": p.wrapShade,
    "--wrap-ink": p.wrapInk,
    "--display": f.display,
    "--body": f.body,
    "--formal": f.formal,
    "--body-size": f.bodySize,
    "--body-leading": f.bodyLeading,
    "--display-weight": String(f.displayWeight),
    "--signoff-style": f.signOffStyle,
    colorScheme: p.dark ? "dark" : "light",
  } as CSSProperties
}
