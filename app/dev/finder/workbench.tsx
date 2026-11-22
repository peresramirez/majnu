"use client"

import { useMemo } from "react"
import { HeroFinder, type Suggestion } from "@/components/landing/hero-finder"
import { createMockTransport } from "./mock-transport"

// Each chip opens the finder on one scripted scenario. "Personalising" follows
// from the first search: tap "Personalise the gift", then an answer. Only
// "Birthday" offers the party pop box when wrapping.
const SCENARIOS: Suggestion[] = [
  { label: "First search", message: "Find a gift for my mother" },
  { label: "Birthday", message: "Find a birthday gift for my mother" },
  { label: "Daily limit", message: "limit: Find a gift for my sister" },
  { label: "Site busy", message: "busy: Find a gift for my uncle" },
  { label: "Needs an account", message: "calendar: An advent calendar for my girlfriend" },
  { label: "Error", message: "error: Find a gift for my boss" },
  { label: "Cut off", message: "cut: Find a gift for my neighbour" },
]

export function FinderWorkbench() {
  const transport = useMemo(() => createMockTransport(), [])
  return <HeroFinder transport={transport} suggestions={SCENARIOS} />
}
