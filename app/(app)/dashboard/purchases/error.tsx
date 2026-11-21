"use client"

import { ErrorState } from "@/components/app/error-state"

export default function PurchasesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Your purchases didn't load"
      body="We couldn't load your purchases just now. Try again in a moment."
    />
  )
}
