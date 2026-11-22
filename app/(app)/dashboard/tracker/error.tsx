"use client"

import { ErrorState } from "@/components/app/error-state"

export default function TrackerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="The tracker didn't load"
      body="We couldn't fetch when your gifts were opened just now. Your gifts are safe. Try again in a moment."
      back={{ href: "/dashboard/gifts", label: "My gifts" }}
    />
  )
}
