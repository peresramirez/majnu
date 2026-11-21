import { Bricolage_Grotesque, Caveat, Courier_Prime } from "next/font/google"

export const sans = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

export const typewriter = Courier_Prime({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-typewriter",
  display: "swap",
})

export const hand = Caveat({
  subsets: ["latin"],
  variable: "--font-hand",
  display: "swap",
})
