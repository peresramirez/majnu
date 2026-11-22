"use client"

// "Make it unique, €2.99": the one paid thing in Majnu (docs/business-plan.md).
// Shown on the finder's wrapped gift and on a letter's preview in the app.
//
// It asks GET /api/purchases?letterId=... where the letter stands, then shows:
// * nothing, for a calendar or a letter that is not built yet;
// * the status of a design being made, or the link once it is ready;
// * otherwise the button. It opens a dialog (never a new page) where a guest
//   is asked to create a free account first (the account is upgraded in
//   place, so the gift comes along), and a member writes a short design
//   request and ticks the required consent box before going to Checkout.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Sparkles, X } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { focusRing, primaryButton, secondaryButton } from "@/components/app/styles"
import { WRAPPER_CONSENT_TEXT, WRAPPER_REQUEST_MAX_CHARS, wrapper } from "@/lib/plans"
import type { WrapperState } from "@/lib/billing/view"
import { PurchaseStatusCard } from "./purchase-status"

type Props = {
  letterId: string
  // Where Checkout's back button returns. Defaults to the current page.
  returnTo?: string
  // Changes when the letter changes (a new build), to look again.
  refreshKey?: number | string
  className?: string
}

const EXAMPLES = ["A 1950s cinema ticket by the sea", "Pressed flowers on old paper", "A night sky with our two stars"]

export function MakeItUnique({ letterId, returnTo, refreshKey, className = "" }: Props) {
  const [state, setState] = useState<WrapperState | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/purchases?letterId=${encodeURIComponent(letterId)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<WrapperState>) : null))
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch(() => {
        if (!cancelled) setState(null)
      })
    return () => {
      cancelled = true
    }
  }, [letterId, refreshKey])

  if (!state || state.unavailable) return null

  const purchase = state.purchase
  if (purchase && (purchase.status === "paid" || purchase.status === "designing" || purchase.status === "done")) {
    return <PurchaseStatusCard key={purchase.id} purchase={purchase} className={className} />
  }

  return (
    <div className={className}>
      {purchase && (purchase.status === "refunded" || purchase.status === "failed") && (
        <p className="mb-2.5 text-[13px] leading-relaxed text-night-lilac">
          Your last design could not be made{purchase.status === "refunded" ? ", so we refunded you in full" : ""}. You can try again.
        </p>
      )}
      <WrapperDialog open={open} onOpenChange={setOpen} letterId={letterId} account={state.account} returnTo={returnTo}>
        {/* A Dialog.Trigger, so focus comes back to it when the dialog closes. */}
        <button type="button" className={`w-full ${secondaryButton} ring-night-rose/50 hover:ring-night-rose`}>
          <Sparkles className="h-4 w-4 text-night-rose" aria-hidden="true" />
          {wrapper.cta}
        </button>
      </WrapperDialog>
    </div>
  )
}

function WrapperDialog({
  open,
  onOpenChange,
  letterId,
  account,
  returnTo,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  letterId: string
  account: WrapperState["account"]
  returnTo?: string
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{children}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-night-deep/80 backdrop-blur-sm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 sm:items-center sm:p-6">
          <DialogPrimitive.Content className="max-h-[calc(100dvh-24px)] w-full overflow-y-auto rounded-t-[24px] bg-night-plum p-5 pb-[max(20px,var(--safe-bottom))] text-night-petal outline-none ring-1 ring-inset ring-night-petal/10 motion-safe:duration-300 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-bottom-4 sm:max-w-[480px] sm:rounded-[24px] sm:p-7 sm:shadow-2xl sm:shadow-black/40">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3 text-night-rose">
                <MoonPhase lit={1} size={26} />
                <DialogPrimitive.Title className="font-display text-[26px] leading-tight text-night-petal">
                  {account === "guest" ? "Create a free account first" : "Make it unique"}
                </DialogPrimitive.Title>
              </div>
              <DialogPrimitive.Close
                className={`-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-lilac transition-colors duration-200 hover:bg-night-petal/10 hover:text-night-petal ${focusRing}`}
                aria-label="Close"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </DialogPrimitive.Close>
            </div>
            {account === "guest" ? <GuestStep letterId={letterId} /> : <RequestStep letterId={letterId} returnTo={returnTo} />}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// Guests come back to this gift in the app after signing up, where the same
// button is waiting. Signing up links the new identity to the guest account,
// so the gift is theirs already (docs/features/guest-accounts.md).
function GuestStep({ letterId }: { letterId: string }) {
  const next = encodeURIComponent(`/create/${letterId}`)
  return (
    <>
      <DialogPrimitive.Description className="mt-3 text-[15px] leading-relaxed text-night-lilac">
        A personalised wrapper is a design Majnu makes for this gift alone, for {wrapper.price} once. Create a free account so your
        receipt and your design have a home. This gift, and everything else you made, comes with you.
      </DialogPrimitive.Description>
      <div className="mt-6 grid gap-2.5">
        <Link href={`/signup?next=${next}`} className={`w-full ${primaryButton}`}>
          Create a free account
        </Link>
        <Link href={`/signin?next=${next}`} className={`w-full ${secondaryButton}`}>
          I have an account
        </Link>
      </div>
    </>
  )
}

function RequestStep({ letterId, returnTo }: { letterId: string; returnTo?: string }) {
  const [request, setRequest] = useState("")
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useId()
  const hintId = useId()
  const consentId = useId()
  const textarea = useRef<HTMLTextAreaElement>(null)

  const trimmed = request.trim()
  const ready = trimmed.length >= 3 && consent && !busy

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (trimmed.length < 3) {
      setError("Describe the look you want in a few words.")
      textarea.current?.focus()
      return
    }
    if (!consent) {
      setError("Tick the box to agree that we start your design straight away.")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letterId,
          request: trimmed,
          consent: true,
          returnTo: returnTo ?? `${window.location.pathname}${window.location.search}`,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { url?: string; error?: string }
      if (response.ok && body.url) {
        window.location.assign(body.url)
        return
      }
      setError(body.error ?? "Something went wrong opening the payment page. Try again.")
    } catch {
      setError("We couldn't reach Majnu just now. Check your connection and try again.")
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <DialogPrimitive.Description className="mt-3 text-[15px] leading-relaxed text-night-lilac">
        Instead of one of our designs, Majnu makes a page for this gift alone, around the person and what you want to say. It is ready in
        about two minutes. {wrapper.price} once, VAT included.
      </DialogPrimitive.Description>

      <label htmlFor={requestId} className="mt-5 block text-sm font-semibold text-night-petal">
        What should it look like?
      </label>
      <textarea
        id={requestId}
        ref={textarea}
        value={request}
        onChange={(e) => setRequest(e.target.value)}
        maxLength={WRAPPER_REQUEST_MAX_CHARS}
        rows={3}
        aria-required="true"
        aria-describedby={hintId}
        placeholder={EXAMPLES[0]}
        disabled={busy}
        className="mt-1.5 block min-h-[96px] w-full resize-y rounded-2xl bg-night-velvet px-4 py-3 text-[16px] text-night-petal ring-1 ring-inset ring-night-petal/15 placeholder:text-night-lilac/60 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-night-rose disabled:opacity-60"
      />
      <div id={hintId} className="mt-1.5 flex items-start justify-between gap-3 text-[13px] leading-snug text-night-lilac">
        <span>A style, a place, a memory, colours. Majnu keeps your words and the gift as they are.</span>
        <span aria-hidden="true" className="shrink-0 tabular-nums">
          {request.length}/{WRAPPER_REQUEST_MAX_CHARS}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2" aria-label="Ideas">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            disabled={busy}
            onClick={() => {
              setRequest(example)
              textarea.current?.focus()
            }}
            className={`min-h-[36px] rounded-full bg-night-petal/[0.04] px-3.5 py-1.5 text-left text-[13px] font-medium text-night-petal ring-1 ring-inset ring-night-petal/20 transition-colors duration-200 hover:bg-night-petal/10 disabled:opacity-50 ${focusRing}`}
          >
            {example}
          </button>
        ))}
      </div>

      <div className="mt-5 flex gap-3 rounded-2xl bg-night-velvet p-3.5 ring-1 ring-inset ring-night-petal/10">
        <input
          id={consentId}
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          aria-required="true"
          disabled={busy}
          className={`mt-0.5 h-5 w-5 flex-none cursor-pointer rounded accent-night-rose ${focusRing}`}
        />
        <label htmlFor={consentId} className="cursor-pointer text-[14px] leading-relaxed text-night-petal">
          {WRAPPER_CONSENT_TEXT}
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm leading-relaxed text-night-petal">
          {error}
        </p>
      )}

      <button type="submit" aria-disabled={!ready} className={`mt-5 w-full ${primaryButton} aria-disabled:opacity-60`}>
        {busy ? (
          <>
            <MoonPhase lit={0.5} size={18} className="motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]" />
            Opening the payment page…
          </>
        ) : (
          `Pay ${wrapper.price}`
        )}
      </button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-night-lilac/80">
        Paid securely through Stripe. If the design cannot be made, you get every cent back.{" "}
        <Link href="/terms#wrapper" className={`rounded underline underline-offset-4 ${focusRing}`} target="_blank">
          Terms
        </Link>
      </p>
    </form>
  )
}
