"use client"

// Gives templates the letter's slug and a `track()` that reports door_open and
// gift_click. In the owner's preview `track()` does nothing, so a sender
// looking at their own gift never counts as an open.
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"
import { makeTracker, type LetterEventType } from "./track"

type LetterContextValue = {
  slug: string
  ownerPreview: boolean
  track: (type: Exclude<LetterEventType, "open">, day?: number) => void
}

const LetterContext = createContext<LetterContextValue>({ slug: "", ownerPreview: true, track: () => {} })

export function LetterProvider({ slug, ownerPreview, children }: { slug: string; ownerPreview: boolean; children: ReactNode }) {
  const value = useMemo(() => ({ slug, ownerPreview, track: makeTracker(slug, ownerPreview) }), [slug, ownerPreview])
  return <LetterContext.Provider value={value}>{children}</LetterContext.Provider>
}

export function useLetter() {
  return useContext(LetterContext)
}

// True when the visitor asked for less motion. False on the server.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    setReduced(query.matches)
    const onChange = () => setReduced(query.matches)
    query.addEventListener?.("change", onChange)
    return () => query.removeEventListener?.("change", onChange)
  }, [])
  return reduced
}

// True once the component has mounted in the browser. Anything that depends on
// the visitor's clock waits for this, so the server render and the first
// browser render match.
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  return mounted
}
