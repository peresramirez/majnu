"use client"

// The Release button next to a claimed gift on My gifts (issue #35). A plain
// form posting to a server action, so it also works before the page's scripts load.
import { useActionState } from "react"
import { smallButton } from "@/components/app/styles"
import { releaseGiftClaim, type ReleaseState } from "./actions"

export function ReleaseClaim({ letterId, itemId, title }: { letterId: string; itemId: string; title: string }) {
  const [state, action, pending] = useActionState<ReleaseState, FormData>(releaseGiftClaim, null)
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="letterId" value={letterId} />
      <input type="hidden" name="itemId" value={itemId} />
      <button type="submit" disabled={pending} className={smallButton} aria-label={`Release ${title}`}>
        {pending ? "Releasing…" : "Release"}
      </button>
      {state?.error ? (
        <p role="alert" className="max-w-[16rem] text-right text-[13px] text-night-rose">
          {state.error}
        </p>
      ) : null}
    </form>
  )
}
