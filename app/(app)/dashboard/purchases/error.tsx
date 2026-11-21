"use client"

import { ErrorState } from "@/components/app/error-state"

export default function PlanError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="Your plan didn't load"
      body="We couldn't check your plan just now. Try again in a moment."
    />
  )
}
