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
// * "Have a code?" (docs/features/coupons.md), a quiet link in both steps,
//   reveals a coupon code field. With a code nothing is paid: guests skip the
//   account step, there is no consent box, and the dialog posts to
//   POST /api/coupons/redeem, then closes on the design's status card, the
//   same card the paid return shows. The paid path is unchanged. A code the
//   browser brought from a poster's short link (/c/<code>) comes back from
//   GET /api/purchases, and the dialog then opens with it filled in.
// * Free designs (docs/features/free-designs.md, issue #85): while this
//   connection has some of today's left (GET /api/purchases says how many),
//   the button says so and the dialog leads with them: a design request,
//   "Free today: 2 of 3 left" and "Make my design, free". No account step,
//   no consent box and no code. It posts to POST /api/designs/free and closes
//   on the status card. Once they are used up, the dialog is as above.
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react"
import Link from "next/link"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { Sparkles, X } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { focusRing, primaryButton, secondaryButton } from "@/components/app/styles"
import { WRAPPER_CONSENT_TEXT, WRAPPER_REQUEST_MAX_CHARS, wrapper } from "@/lib/plans"
import { normaliseCouponCode } from "@/lib/billing/coupon-code"
import type { FreeDesigns, PurchaseView, WrapperState } from "@/lib/billing/view"
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

// The button while today's free designs last, instead of "Make it unique, €2.99".
const FREE_CTA = "Make it unique, free today"

export function MakeItUnique({ letterId, returnTo, refreshKey, className = "" }: Props) {
  const [state, setState] = useState<WrapperState | null>(null)
  const [open, setOpen] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const focusCard = useRef(false)

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

  // After a code was redeemed the dialog has closed and its trigger is gone:
  // move focus to the status card that replaced it. Radix returns focus on a
  // timer when the dialog unmounts, so this runs on one scheduled after it.
  const purchase = state?.purchase ?? null
  useEffect(() => {
    if (!focusCard.current || !purchase) return
    focusCard.current = false
    const timer = setTimeout(() => card.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [purchase])

  if (!state || state.unavailable) return null

  if (purchase && (purchase.status === "paid" || purchase.status === "designing" || purchase.status === "done")) {
    return (
      <div ref={card} tabIndex={-1} className={`outline-none ${className}`}>
        <PurchaseStatusCard key={purchase.id} purchase={purchase} />
      </div>
    )
  }

  const freeDesigns = state.freeDesigns ?? null
  const freeLeft = freeDesigns !== null && freeDesigns.left > 0

  // A code was redeemed, or a free design claimed (which also says how many
  // are left today).
  function redeemed(next: PurchaseView, nextFree?: FreeDesigns | null) {
    focusCard.current = true
    setOpen(false)
    setState((current) =>
      current
        ? {
            ...current,
            purchase: next,
            // The server forgot a remembered code once it was redeemed.
            rememberedCode: next.freeWithCode ? null : current.rememberedCode,
            freeDesigns: nextFree === undefined ? current.freeDesigns : nextFree,
          }
        : current,
    )
  }

  // Another tab (or someone else on this connection) used today's last free
  // design, or they are not offered any more: the dialog falls back to a code
  // and payment.
  function freeGone(next: FreeDesigns | null) {
    setState((current) => (current ? { ...current, freeDesigns: next } : current))
  }

  return (
    <div className={className}>
      {purchase && (purchase.status === "refunded" || purchase.status === "failed") && (
        <p className="mb-2.5 text-[13px] leading-relaxed text-night-lilac">
          {purchase.freeWithCode
            ? "Your last design could not be made. Your code works again, so you can try once more."
            : purchase.freeDesign
              ? "Your last design could not be made, so it didn't count. You can try again."
              : `Your last design could not be made${purchase.status === "refunded" ? ", so we refunded you in full" : ""}. You can try again.`}
        </p>
      )}
      <WrapperDialog
        open={open}
        onOpenChange={setOpen}
        letterId={letterId}
        account={state.account}
        rememberedCode={state.rememberedCode ?? null}
        freeDesigns={freeDesigns}
        returnTo={returnTo}
        onRedeemed={redeemed}
        onFreeGone={freeGone}
      >
        {/* A Dialog.Trigger, so focus comes back to it when the dialog closes. */}
        <button type="button" className={`w-full ${secondaryButton} ring-night-rose/50 hover:ring-night-rose`}>
          <Sparkles className="h-4 w-4 text-night-rose" aria-hidden="true" />
          {freeLeft ? FREE_CTA : wrapper.cta}
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
  rememberedCode,
  freeDesigns,
  returnTo,
  onRedeemed,
  onFreeGone,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  letterId: string
  account: WrapperState["account"]
  rememberedCode: string | null
  freeDesigns: FreeDesigns | null
  returnTo?: string
  onRedeemed: (purchase: PurchaseView, freeDesigns?: FreeDesigns | null) => void
  onFreeGone: (freeDesigns: FreeDesigns | null) => void
  children: ReactNode
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Trigger asChild>{children}</DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] flex items-end justify-center bg-night-deep/80 backdrop-blur-sm motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 sm:items-center sm:p-6">
          <DialogPrimitive.Content className="max-h-[calc(100dvh-24px)] w-full overflow-y-auto rounded-t-[24px] bg-night-plum p-5 pb-[max(20px,var(--safe-bottom))] text-night-petal outline-none ring-1 ring-inset ring-night-petal/10 motion-safe:duration-300 motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:slide-in-from-bottom-4 sm:max-w-[480px] sm:rounded-[24px] sm:p-7 sm:shadow-2xl sm:shadow-black/40">
            <DialogBody
              letterId={letterId}
              account={account}
              rememberedCode={rememberedCode}
              freeDesigns={freeDesigns}
              returnTo={returnTo}
              onRedeemed={onRedeemed}
              onFreeGone={onFreeGone}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

// Lives inside the dialog's content, so "Have a code?" starts closed each time
// the dialog opens, or open with the remembered code.
function DialogBody({
  letterId,
  account,
  rememberedCode,
  freeDesigns,
  returnTo,
  onRedeemed,
  onFreeGone,
}: {
  letterId: string
  account: WrapperState["account"]
  rememberedCode: string | null
  freeDesigns: FreeDesigns | null
  returnTo?: string
  onRedeemed: (purchase: PurchaseView, freeDesigns?: FreeDesigns | null) => void
  onFreeGone: (freeDesigns: FreeDesigns | null) => void
}) {
  // While one of today's free designs is left, the dialog offers only that.
  const free = freeDesigns !== null && freeDesigns.left > 0 ? freeDesigns : null
  const [withCode, setWithCode] = useState(rememberedCode !== null && free === null)
  // Why the free design was refused, once the dialog has fallen back.
  const [notice, setNotice] = useState<string | null>(null)
  const noticeRef = useRef<HTMLParagraphElement>(null)
  const accountStep = account === "guest" && !withCode && free === null

  // The free form's button is gone for a guest (the account step replaces
  // it): put focus on the reason instead of losing it.
  useEffect(() => {
    if (!notice) return
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected) noticeRef.current?.focus()
  }, [notice])

  function freeRefused(next: FreeDesigns | null, message: string) {
    setNotice(message)
    onFreeGone(next)
  }

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 text-night-rose">
          <MoonPhase lit={1} size={26} />
          <DialogPrimitive.Title className="font-display text-[26px] leading-tight text-night-petal">
            {accountStep ? "Create a free account first" : "Make it unique"}
          </DialogPrimitive.Title>
        </div>
        <DialogPrimitive.Close
          className={`-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-night-lilac transition-colors duration-200 hover:bg-night-petal/10 hover:text-night-petal ${focusRing}`}
          aria-label="Close"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </DialogPrimitive.Close>
      </div>
      {notice && (
        <p
          ref={noticeRef}
          tabIndex={-1}
          role="alert"
          className="mt-3 rounded-2xl bg-night-velvet px-4 py-3 text-[14px] leading-relaxed text-night-petal outline-none ring-1 ring-inset ring-night-petal/10"
        >
          {notice}
        </p>
      )}
      {accountStep ? (
        <GuestStep letterId={letterId} onHaveCode={() => setWithCode(true)} />
      ) : (
        <RequestStep
          letterId={letterId}
          returnTo={returnTo}
          free={free}
          withCode={withCode}
          initialCode={rememberedCode ?? ""}
          onWithCodeChange={setWithCode}
          noCodeLabel={account === "guest" ? "I don't have a code" : "Pay instead"}
          onRedeemed={onRedeemed}
          onFreeRefused={freeRefused}
        />
      )}
    </>
  )
}

// A quiet text button: "Have a code?" and its way back. 44 px tall for touch.
const quietLink = `inline-flex min-h-[44px] items-center rounded px-2 text-[13px] font-medium text-night-lilac underline decoration-night-lilac/40 underline-offset-4 transition-colors duration-200 hover:text-night-petal hover:decoration-night-petal/60 ${focusRing}`

// Guests come back to this gift in the app after signing up, where the same
// button is waiting. Signing up links the new identity to the guest account,
// so the gift is theirs already (docs/features/guest-accounts.md).
function GuestStep({ letterId, onHaveCode }: { letterId: string; onHaveCode: () => void }) {
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
      <p className="mt-3 text-center">
        <button type="button" onClick={onHaveCode} className={quietLink}>
          Have a code?
        </button>
      </p>
    </>
  )
}

type Refusal = { error?: string; reason?: string }

function RequestStep({
  letterId,
  returnTo,
  free,
  withCode,
  initialCode,
  onWithCodeChange,
  noCodeLabel,
  onRedeemed,
  onFreeRefused,
}: {
  letterId: string
  returnTo?: string
  // Today's free designs, while one is left: the form then makes a free one.
  free: FreeDesigns | null
  withCode: boolean
  initialCode: string
  onWithCodeChange: (withCode: boolean) => void
  noCodeLabel: string
  onRedeemed: (purchase: PurchaseView, freeDesigns?: FreeDesigns | null) => void
  onFreeRefused: (freeDesigns: FreeDesigns | null, message: string) => void
}) {
  const [request, setRequest] = useState("")
  const [consent, setConsent] = useState(false)
  const [code, setCode] = useState(initialCode)
  const [codeWrong, setCodeWrong] = useState(false)
  const [busy, setBusy] = useState(false)
  // Bumped to move focus to the code field once it is enabled again after a refusal.
  const [refocusCode, setRefocusCode] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const requestId = useId()
  const hintId = useId()
  const consentId = useId()
  const codeId = useId()
  const codeHintId = useId()
  const errorId = useId()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const haveCode = useRef<HTMLButtonElement>(null)
  const hadCode = useRef(withCode)
  // Opened with a remembered code: the request is what is left to fill in.
  const prefilled = useRef(initialCode !== "")

  // Follow the switch: into the code field when it appears (also when a guest
  // arrives here with a code), back to "Have a code?" when it goes.
  useEffect(() => {
    if (withCode) (prefilled.current ? textarea : codeInput).current?.focus()
    else if (hadCode.current) haveCode.current?.focus()
    hadCode.current = withCode
  }, [withCode])

  useEffect(() => {
    if (refocusCode > 0) codeInput.current?.focus()
  }, [refocusCode])

  const trimmed = request.trim()
  // Nothing to pay: free and code designs need no consent.
  const ready = trimmed.length >= 3 && (free ? true : withCode ? code.trim().length > 0 : consent) && !busy

  function toggleCode(next: boolean) {
    prefilled.current = false
    setError(null)
    setCodeWrong(false)
    onWithCodeChange(next)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    if (trimmed.length < 3) {
      setError("Describe the look you want in a few words.")
      textarea.current?.focus()
      return
    }
    if (free) return claimFree()
    if (withCode) return redeem()
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

  // One of today's free designs: no Checkout, no consent and no code.
  async function claimFree() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch("/api/designs/free", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterId, request: trimmed }),
      })
      const body = (await response.json().catch(() => ({}))) as { purchase?: PurchaseView; freeDesigns?: FreeDesigns | null } & Refusal
      if (response.ok && body.purchase) {
        onRedeemed(body.purchase, body.freeDesigns ?? null)
        return
      }
      if (body.reason === "free_used_up" || body.reason === "free_unavailable") {
        // Fall back to a code or payment; what a member typed stays.
        setBusy(false)
        const next = body.reason === "free_used_up" ? (body.freeDesigns ?? { left: 0, perDay: free?.perDay ?? 0 }) : null
        onFreeRefused(next, body.error ?? "Today's free designs are used up.")
        return
      }
      setError(body.error ?? "Something went wrong starting your design. Try again.")
    } catch {
      setError("We couldn't reach Majnu just now. Check your connection and try again.")
    }
    setBusy(false)
  }

  // With a code nothing is paid: no Checkout and no consent, straight to the design.
  async function redeem() {
    if (!code.trim()) {
      setCodeWrong(true)
      setError("Type your code.")
      codeInput.current?.focus()
      return
    }
    if (!normaliseCouponCode(code)) {
      setCodeWrong(true)
      setError("That code doesn't work. Check it and try again.")
      codeInput.current?.focus()
      return
    }
    setBusy(true)
    setError(null)
    setCodeWrong(false)
    try {
      const response = await fetch("/api/coupons/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ letterId, request: trimmed, coupon: code }),
      })
      const body = (await response.json().catch(() => ({}))) as { purchase?: PurchaseView } & Refusal
      if (response.ok && body.purchase) {
        onRedeemed(body.purchase)
        return
      }
      const aboutCode = typeof body.reason === "string" && body.reason.startsWith("code_")
      setCodeWrong(aboutCode)
      setError(body.error ?? "Something went wrong starting your design. Try again.")
      // The field is disabled while busy; focus it after it is enabled again.
      if (aboutCode) setRefocusCode((n) => n + 1)
    } catch {
      setError("We couldn't reach Majnu just now. Check your connection and try again.")
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={busy}>
      <DialogPrimitive.Description className="mt-3 text-[15px] leading-relaxed text-night-lilac">
        Instead of one of our designs, Majnu makes a page for this gift alone, around the person and what you want to say. It is ready in
        about two minutes{free ? ", and free today." : withCode ? ". Free with your code." : `. ${wrapper.price} once, VAT included.`}
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

      {free ? null : withCode ? (
        <div className="mt-5">
          <div className="flex items-end justify-between gap-3">
            <label htmlFor={codeId} className="block text-sm font-semibold text-night-petal">
              Your code
            </label>
            <button type="button" onClick={() => toggleCode(false)} disabled={busy} className={`-mb-3 -mr-2 ${quietLink}`}>
              {noCodeLabel}
            </button>
          </div>
          <input
            id={codeId}
            ref={codeInput}
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              if (codeWrong) setCodeWrong(false)
            }}
            maxLength={40}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            aria-required="true"
            aria-invalid={codeWrong || undefined}
            aria-describedby={codeWrong && error ? `${codeHintId} ${errorId}` : codeHintId}
            disabled={busy}
            className="mt-1.5 block h-12 w-full rounded-2xl bg-night-velvet px-4 font-mono text-[16px] uppercase tracking-[0.08em] text-night-petal ring-1 ring-inset ring-night-petal/15 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-night-rose aria-[invalid=true]:ring-night-rose/70 disabled:opacity-60"
          />
          <p id={codeHintId} className="mt-1.5 text-[13px] leading-snug text-night-lilac">
            Capitals, spaces and dashes don&rsquo;t matter.
          </p>
        </div>
      ) : (
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
      )}

      {error && (
        <p id={errorId} role="alert" className="mt-3 text-sm leading-relaxed text-night-petal">
          {error}
        </p>
      )}

      {free && (
        <p className="mt-5 text-[13px] leading-snug text-night-lilac">
          Free today: {free.left} of {free.perDay} left
        </p>
      )}

      <button type="submit" aria-disabled={!ready} className={`${free ? "mt-2.5" : "mt-5"} w-full ${primaryButton} aria-disabled:opacity-60`}>
        {busy ? (
          <>
            <MoonPhase lit={0.5} size={18} className="motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]" />
            {free || withCode ? "Starting your design…" : "Opening the payment page…"}
          </>
        ) : free ? (
          "Make my design, free"
        ) : withCode ? (
          "Make my design"
        ) : (
          `Pay ${wrapper.price}`
        )}
      </button>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-night-lilac/80">
        {free
          ? "Nothing to pay. If the design cannot be made, it doesn't count."
          : withCode
            ? "Nothing to pay. If the design cannot be made, your code works again."
            : "Paid securely through Stripe. If the design cannot be made, you get every cent back."}{" "}
        <Link href="/terms#wrapper" className={`rounded underline underline-offset-4 ${focusRing}`} target="_blank">
          Terms
        </Link>
      </p>
      {!withCode && !free && (
        <p className="mt-1 text-center">
          <button ref={haveCode} type="button" onClick={() => toggleCode(true)} disabled={busy} className={quietLink}>
            Have a code?
          </button>
        </p>
      )}
    </form>
  )
}
