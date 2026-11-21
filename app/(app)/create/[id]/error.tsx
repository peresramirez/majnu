"use client"

import { ErrorState } from "@/components/app/error-state"

export default function GiftError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorState
      error={error}
      reset={reset}
      title="This gift didn't open"
      body="Something went wrong loading the conversation. Your gift is saved. Try again, or find it in My gifts."
      back={{ href: "/dashboard/gifts", label: "My gifts" }}
    />
  )
}
