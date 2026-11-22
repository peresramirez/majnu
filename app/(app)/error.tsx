"use client"

import { ErrorState } from "@/components/app/error-state"

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="This page didn't load"
      body="Something went wrong on our side. Try again, or go back to where you were."
    />
  )
}
