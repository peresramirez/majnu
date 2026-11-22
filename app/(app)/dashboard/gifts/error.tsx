"use client"

import { ErrorState } from "@/components/app/error-state"

export default function GiftsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Your gifts didn't load"
      body="We couldn't fetch your gifts just now. They are safe. Try again in a moment."
    />
  )
}
