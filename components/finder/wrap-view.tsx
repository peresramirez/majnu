"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, Maximize2 } from "lucide-react"
import { LETTERS_CHAT } from "@/components/app/tabs"
import { MoonPhase } from "@/components/brand/moon-phase"
import { TemplateCard } from "@/components/letters/template-card"
import { SharePanel } from "@/components/share/share-panel"
import { AudioNoteRecorder } from "@/components/voice/audio-note-recorder"
import { MakeItUnique } from "@/components/wrapper/make-it-unique"
import type { WrapTemplateId } from "@/lib/finder/events"
import { createClient } from "@/lib/supabase/client"
import { WRAP_TEMPLATES, wrapAccount, type WrapAccount, type WrapDetails, type WrapState } from "./finder-state"
import { ProductImage } from "./gift-option-card"
import { PreviewDialog } from "./preview-dialog"
import { focusRing, primaryButton, quietLink, textLink } from "./styles"
import { shopName } from "./urls"

type OpenWrap = Exclude<WrapState, { stage: "closed" }>

type Props = {
  wrap: OpenWrap
  onTemplate: (id: WrapTemplateId) => void
  onWrap: (details: WrapDetails) => void
  onBack: () => void
  previewUrl: (letterId: string, templateId: WrapTemplateId) => string
  shareUrl: (slug: string) => string
}

// The wrap form and its submit button live apart: the form scrolls inside the
// finder, the button stays in a bar at the bottom of it (WrapFooter).
export const WRAP_FORM_ID = "finder-wrap-form"

const field = `mt-1.5 block w-full rounded-2xl bg-night-plum px-4 py-3 text-[16px] text-night-petal ring-1 ring-inset ring-night-petal/15 placeholder:text-night-lilac/60 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-night-rose disabled:opacity-60`

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className={`inline-flex items-center gap-1.5 rounded-full py-1 text-sm font-semibold text-night-lilac hover:text-night-petal ${focusRing}`}>
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Back to the gift ideas
    </button>
  )
}

// The bar under the wrap form: the gift being wrapped, any error, and the one
// thing to do. It sits outside the scrolling area, so it is always in view.
export function WrapFooter({ wrap }: { wrap: OpenWrap }) {
  const busy = wrap.stage === "wrapping"
  const { option } = wrap
  // The price first: on a phone the end of this line is cut off.
  const meta = [option.price, shopName(option)].filter(Boolean).join(" · ")
  const error = wrap.stage === "choose" ? wrap.error : undefined
  return (
    <div className="shrink-0 border-t border-night-petal/10 bg-night-plum pb-[max(10px,env(safe-area-inset-bottom))] pt-2.5">
      {/* Same padding as the content above, so the edges line up. */}
      <div className="px-4 sm:px-5">
        {error && (
          <p role="alert" className="mb-2.5 text-sm leading-relaxed text-night-petal">
            {error}{" "}
            {wrap.stage === "choose" && wrap.reason === "signin_required" && (
              <Link href="/signup" className={textLink}>
                Sign up
              </Link>
            )}
          </p>
        )}
        <div className="flex items-center gap-3">
          <ProductImage src={option.imageUrl} className="aspect-square w-10 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold leading-snug text-night-petal">{option.title}</p>
            <p className="truncate text-xs leading-snug text-night-lilac" aria-live="polite">
              {busy ? "Majnu is writing the page…" : meta}
            </p>
          </div>
          <button type="submit" form={WRAP_FORM_ID} className={`${primaryButton} shrink-0`} aria-disabled={busy}>
            {busy ? (
              <>
                <MoonPhase lit={0.5} size={18} className="motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]" />
                <span className="hidden sm:inline">Wrapping…</span>
                <span className="sr-only sm:hidden">Wrapping</span>
              </>
            ) : (
              "Wrap the gift"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// Whether the finder's session is a guest (anonymous) account or a signed-up
// one: the session is the one the finder made or found before the first
// search (anonymous-session.ts), read from this browser without a request.
// Only the wording depends on it. Null until it is known, so a member never
// sees the guest's sentence flash by.
function useAccount(): WrapAccount | null {
  const [account, setAccount] = useState<WrapAccount | null>(null)
  useEffect(() => {
    let cancelled = false
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (!cancelled) setAccount(wrapAccount(data.session?.user))
      })
      .catch(() => {
        if (!cancelled) setAccount("guest")
      })
    return () => {
      cancelled = true
    }
  }, [])
  return account
}

// Under the share panel: where the gift is kept, and calendars. A guest's
// gift lives in this browser until they sign up; a member's is in My gifts.
function KeepingNote({ account }: { account: WrapAccount | null }) {
  if (!account) return null
  if (account === "member") {
    return (
      <div className="space-y-2 text-sm leading-relaxed text-night-lilac">
        <p>
          This gift is in{" "}
          <Link href="/dashboard/gifts" className={quietLink}>
            My gifts
          </Link>
          , where you will see when they open it.
        </p>
        <p>
          Want to send an advent calendar instead?{" "}
          {/* As the Create tab's "Make a calendar": the letters chat with the calendar attached. */}
          <Link href={`${LETTERS_CHAT}?template=advent-classic`} className={quietLink}>
            Make a calendar
          </Link>
          .
        </p>
      </div>
    )
  }
  return (
    <div className="space-y-2 text-sm leading-relaxed text-night-lilac">
      <p>
        This gift is kept in this browser.{" "}
        <Link href="/signup" className={quietLink}>
          Sign up to keep your gifts
        </Link>{" "}
        on any phone or computer.
      </p>
      <p>Want to send an advent calendar instead? Calendars need an account.</p>
    </div>
  )
}

// The page they will open, in a phone-shaped frame. A quiet moon shows until
// it has loaded, so the frame is never an empty box.
function PreviewFrame({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative h-[min(560px,68svh)] overflow-hidden rounded-[22px] bg-night-deep ring-1 ring-inset ring-night-petal/15 md:h-auto md:min-h-0 md:flex-1">
      {!loaded && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-night-lilac" aria-hidden="true">
          <MoonPhase lit={0.5} size={28} className="text-night-rose motion-safe:animate-[moon-breathe_2.4s_ease-in-out_infinite]" />
          <span className="text-sm">Opening the preview…</span>
        </div>
      )}
      <iframe
        src={src}
        title="Preview of the gift"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 h-full w-full transition-opacity duration-500 ease-calm ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  )
}

// Wrapping the chosen gift: pick a template, add names if you like, then see
// the page as they will and send the link.
export function WrapView({ wrap, onTemplate, onWrap, onBack, previewUrl, shareUrl }: Props) {
  const [details, setDetails] = useState<WrapDetails>({ recipientName: "", senderName: "", note: "" })
  // The finished page, larger, in a dialog over the finder.
  const [enlarged, setEnlarged] = useState<string | null>(null)
  // Bumped when the voice note changes, so the preview reloads with it.
  const [noteVersion, setNoteVersion] = useState(0)
  const account = useAccount()
  const busy = wrap.stage === "wrapping"

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!busy) onWrap(details)
  }

  if (wrap.stage === "ready") {
    const base = previewUrl(wrap.letterId, wrap.templateId)
    const src = noteVersion ? `${base}${base.includes("?") ? "&" : "?"}note=${noteVersion}` : base
    // From md up this fills the finder exactly: the preview takes the height
    // that is left, the share panel sits beside it, and nothing scrolls.
    return (
      <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        <BackButton onBack={onBack} />
        <h2 className="mt-2 font-display text-2xl leading-tight text-night-petal outline-none" tabIndex={-1} data-autofocus>
          Ready to send
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-night-lilac">This is the page they will open. Send them the link, or show them the QR code.</p>
        <div className="mt-4 grid gap-5 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
          {/* On phones the link comes first: sending it is the point. */}
          <div className="order-first space-y-4 md:order-none md:col-start-2 md:row-start-1 md:min-h-0 md:overflow-y-auto">
            <SharePanel url={shareUrl(wrap.slug)} />
            {/* A voice note: most senders add it here, right after wrapping. */}
            <AudioNoteRecorder letterId={wrap.letterId} recipientName={details.recipientName || null} onChange={() => setNoteVersion((v) => v + 1)} />
            {/* The personalised wrapper: a guest is asked to create a free account first. */}
            <MakeItUnique letterId={wrap.letterId} />
            <KeepingNote account={account} />
          </div>
          <div className="flex flex-col md:col-start-1 md:row-start-1 md:min-h-0">
            <PreviewFrame key={src} src={src} />
            <button type="button" onClick={() => setEnlarged(src)} className={`mt-2.5 inline-flex items-center gap-1.5 self-start text-sm ${quietLink}`}>
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              See the page larger
            </button>
          </div>
        </div>
        <PreviewDialog src={enlarged} title="Your gift, as they will see it" onClose={() => setEnlarged(null)} />
      </div>
    )
  }

  return (
    <form id={WRAP_FORM_ID} onSubmit={submit} aria-busy={busy}>
      <BackButton onBack={onBack} />
      <h2 className="mt-2 font-display text-2xl leading-tight text-night-petal outline-none" tabIndex={-1} data-autofocus>
        Wrap it in a page for them
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-night-lilac">Majnu writes the page around your gift. Choose how it looks.</p>

      <fieldset className="mt-4" disabled={busy}>
        <legend className="sr-only">Design</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {WRAP_TEMPLATES.map((id) => {
            const selected = wrap.templateId === id
            return (
              <label key={id} className="group relative block cursor-pointer rounded-3xl">
                <input type="radio" name="template" value={id} checked={selected} onChange={() => onTemplate(id)} className="peer sr-only" />
                <TemplateCard
                  id={id}
                  orientation="responsive"
                  className={`h-full transition-shadow duration-300 ease-calm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-night-rose [&_[data-template-thumbnail]]:w-[88px] md:[&_[data-template-thumbnail]]:mx-auto md:[&_[data-template-thumbnail]]:w-full md:[&_[data-template-thumbnail]]:max-w-[150px] ${
                    selected ? "ring-2 ring-night-rose" : "group-hover:ring-night-petal/30"
                  }`}
                />
                {selected && (
                  <span aria-hidden="true" className="pointer-events-none absolute right-3 top-3 rounded-full bg-night-rose px-2.5 py-1 text-xs font-semibold text-night-plum">
                    Chosen
                  </span>
                )}
              </label>
            )
          })}
        </div>
      </fieldset>

      <fieldset className="mt-5 grid gap-4 sm:grid-cols-2" disabled={busy}>
        <legend className="sr-only">Names and a note, all optional</legend>
        <label className="block text-sm font-medium text-night-petal">
          Their name <span className="font-normal text-night-lilac">(optional)</span>
          <input className={field} value={details.recipientName} onChange={(e) => setDetails({ ...details, recipientName: e.target.value })} autoComplete="off" maxLength={80} />
        </label>
        <label className="block text-sm font-medium text-night-petal">
          Your name <span className="font-normal text-night-lilac">(optional)</span>
          <input className={field} value={details.senderName} onChange={(e) => setDetails({ ...details, senderName: e.target.value })} autoComplete="given-name" maxLength={80} />
        </label>
        <label className="block text-sm font-medium text-night-petal sm:col-span-2">
          Anything you want to say <span className="font-normal text-night-lilac">(optional)</span>
          <textarea
            className={`${field} min-h-[72px] resize-y`}
            value={details.note}
            onChange={(e) => setDetails({ ...details, note: e.target.value })}
            placeholder="Happy birthday, Mum. I saw this and thought of our walks."
            rows={2}
            maxLength={600}
          />
        </label>
      </fieldset>
    </form>
  )
}
