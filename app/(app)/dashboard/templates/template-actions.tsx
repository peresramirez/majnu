"use client"

// The buttons under each card on the Templates tab: "Preview" opens the
// template in a modal (an iframe of its /dev/templates page, rendered from the
// fixture), and "Use this template" starts a new gift in the Letters &
// invitations chat with the template already attached (create-chat.tsx reads
// ?template=). Guests are sent to create an account for calendars, which the
// chat would otherwise refuse them.
import Link from "next/link"
import { useState } from "react"
import { X } from "lucide-react"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { focusRing, primaryButton, smallButton } from "@/components/app/styles"

// A guest who signs up from a calendar template comes back to the gallery.
const SIGN_UP_HERE = `/signup?next=${encodeURIComponent("/dashboard/templates")}`

function templateHref(id: string) {
  return `/dashboard?template=${encodeURIComponent(id)}`
}

const smallPrimary = `inline-flex items-center justify-center gap-1.5 rounded-full bg-night-rose px-3.5 py-2 text-sm font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-[#F1C4A9] ${focusRing}`

export function TemplateActions({
  id,
  name,
  description,
  needsAccount,
}: {
  id: string
  name: string
  description: string
  // A guest looking at a calendar: offer sign-up instead of the chat.
  needsAccount: boolean
}) {
  const [open, setOpen] = useState(false)
  const href = templateHref(id)
  const use = needsAccount ? (
    <Link href={SIGN_UP_HERE} className={smallPrimary}>
      Create an account<span className="sr-only">: {name}</span>
    </Link>
  ) : (
    <Link href={href} className={smallPrimary}>
      Use this template<span className="sr-only">: {name}</span>
    </Link>
  )

  return (
    <span className="mt-4 flex flex-wrap gap-2">
      <Dialog open={open} onOpenChange={setOpen}>
        {/* A real trigger, so closing the preview puts focus back on it. */}
        <DialogTrigger asChild>
          <button type="button" className={smallButton}>
            Preview<span className="sr-only"> {name}</span>
          </button>
        </DialogTrigger>
        {use}
        <DialogContent
          className={[
            "dark flex flex-col gap-0 overflow-hidden border-0 bg-night-plum p-0 text-night-petal",
            // Phones: the whole screen, rising from the bottom.
            "h-[100dvh] max-w-none max-sm:left-0 max-sm:top-0 max-sm:translate-x-0 max-sm:translate-y-0",
            "max-sm:data-[state=open]:slide-in-from-left-0 max-sm:data-[state=open]:slide-in-from-top-0 max-sm:data-[state=closed]:slide-out-to-left-0 max-sm:data-[state=closed]:slide-out-to-top-0",
            // From 640 px: a phone-sized frame in the middle of the screen.
            "sm:h-[min(880px,94dvh)] sm:w-[420px] sm:rounded-[28px] sm:ring-1 sm:ring-night-petal/10",
            "motion-reduce:!animate-none",
            // The dialog's own small close button is replaced by a larger one below.
            "[&>button:last-child]:hidden",
          ].join(" ")}
        >
          <div className="flex flex-none items-center gap-3 border-b border-night-petal/10 py-2 pl-5 pr-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate font-display text-[20px] font-normal leading-tight text-night-petal">{name}</DialogTitle>
              <DialogDescription className="truncate text-[13px] text-night-lilac">Preview with example words</DialogDescription>
            </div>
            <DialogClose className={`flex h-11 w-11 flex-none items-center justify-center rounded-full text-night-lilac transition-colors hover:text-night-petal ${focusRing}`}>
              <X className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Close the preview</span>
            </DialogClose>
          </div>

          <div className="relative min-h-0 flex-1 bg-night-plum">
            <p className="absolute inset-0 flex items-center justify-center text-[14px] text-night-lilac" aria-hidden="true">
              Loading the preview…
            </p>
            <iframe src={`/dev/templates/${id}`} title={`${name}, a preview with example words`} className="relative block h-full w-full" />
          </div>

          <div className="flex-none border-t border-night-petal/10 px-4 pb-[max(1rem,var(--safe-bottom))] pt-3">
            <p className="mb-3 line-clamp-2 text-[13px] leading-snug text-night-lilac">{description}</p>
            {needsAccount ? (
              <Link href={SIGN_UP_HERE} className={`${primaryButton} w-full`}>
                Create an account to make one
              </Link>
            ) : (
              <Link href={href} className={`${primaryButton} w-full`}>
                Use this template
              </Link>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </span>
  )
}
