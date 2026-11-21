"use client"

import Link from "next/link"
import { useEffect } from "react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { primaryButton, secondaryButton } from "./styles"

// What a screen shows when loading it failed: what happened, and what to do.
export function ErrorState({
  error,
  reset,
  title,
  body,
  back = { href: "/dashboard", label: "Create a gift" },
}: {
  error?: Error & { digest?: string }
  reset?: () => void
  title: string
  body: string
  back?: { href: string; label: string } | null
}) {
  useEffect(() => {
    if (error) console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-4 py-16 sm:px-6">
      <MoonPhase lit={0.5} size={36} className="text-night-rose" />
      <h1 className="mt-6 font-display text-[32px] leading-tight text-night-petal">{title}</h1>
      <p className="mt-3 text-[17px] leading-relaxed text-night-lilac">{body}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        {reset && (
          <button type="button" onClick={reset} className={primaryButton}>
            Try again
          </button>
        )}
        {back && (
          <Link href={back.href} className={reset ? secondaryButton : primaryButton}>
            {back.label}
          </Link>
        )}
      </div>
      {error?.digest && <p className="mt-8 text-xs text-night-lilac/60">Reference {error.digest}</p>}
    </div>
  )
}
