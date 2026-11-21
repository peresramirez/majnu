"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight } from "lucide-react"
import { MoonPhase } from "@/components/brand/moon-phase"
import { TemplateCard } from "@/components/letters/template-card"
import { SharePanel } from "@/components/share/share-panel"
import type { WrapTemplateId } from "@/lib/finder/events"
import { WRAP_TEMPLATES, type WrapDetails, type WrapState } from "./finder-state"
import { ProductImage } from "./gift-option-card"
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
    <div className="shrink-0 border-t border-night-petal/10 bg-night-plum pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
      {/* Same width and padding as the content above, so the edges line up. */}
      <div className="mx-auto max-w-[920px] px-4 sm:px-6">
        {error && (
          <p role="alert" className="mb-3 text-[15px] leading-relaxed text-night-petal">
            {error}{" "}
            {wrap.stage === "choose" && wrap.reason === "signin_required" && (
              <Link href="/signup" className={textLink}>
                Sign up
              </Link>
            )}
          </p>
        )}
        <div className="flex items-center gap-3">
          <ProductImage src={option.imageUrl} className="aspect-square w-11 shrink-0 rounded-xl sm:w-12" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold leading-snug text-night-petal">{option.title}</p>
            <p className="truncate text-[13px] leading-snug text-night-lilac" aria-live="polite">
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

// The page they will open, in a phone-shaped frame. A quiet moon shows until
// it has loaded, so the frame is never an empty box.
function PreviewFrame({ src }: { src: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative h-[min(560px,68svh)] overflow-hidden rounded-[28px] bg-night-deep ring-1 ring-inset ring-night-petal/15 md:h-auto md:min-h-0 md:flex-1">
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
  const busy = wrap.stage === "wrapping"

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!busy) onWrap(details)
  }

  if (wrap.stage === "ready") {
    const src = previewUrl(wrap.letterId, wrap.templateId)
    // From md up this fills the finder exactly: the preview takes the height
    // that is left, the share panel sits beside it, and nothing scrolls.
    return (
      <div className="md:flex md:min-h-0 md:flex-1 md:flex-col">
        <BackButton onBack={onBack} />
        <h2 className="mt-3 font-display text-[28px] leading-tight text-night-petal outline-none" tabIndex={-1} data-autofocus>
          Ready to send
        </h2>
        <p className="mt-1 text-[15px] leading-relaxed text-night-lilac">This is the page they will open. Send them the link, or show them the QR code.</p>
        <div className="mt-5 grid gap-5 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)] md:gap-8 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
          {/* On phones the link comes first: sending it is the point. */}
          <div className="order-first space-y-4 md:order-none md:col-start-2 md:row-start-1 md:min-h-0 md:overflow-y-auto">
            <SharePanel url={shareUrl(wrap.slug)} />
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
          </div>
          <div className="flex flex-col md:col-start-1 md:row-start-1 md:min-h-0">
            <PreviewFrame key={src} src={src} />
            <a href={src} target="_blank" rel="noopener" className={`mt-2.5 inline-flex items-center gap-1 self-start text-sm ${quietLink}`}>
              Open the preview full screen
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form id={WRAP_FORM_ID} onSubmit={submit} aria-busy={busy}>
      <BackButton onBack={onBack} />
      <h2 className="mt-3 font-display text-[28px] leading-tight text-night-petal outline-none" tabIndex={-1} data-autofocus>
        Wrap it in a page for them
      </h2>
      <p className="mt-1 text-[15px] leading-relaxed text-night-lilac">Majnu writes the page around your gift. Choose how it looks.</p>

      <fieldset className="mt-5" disabled={busy}>
        <legend className="sr-only">Design</legend>
        <div className="grid gap-3 md:grid-cols-3 md:gap-4">
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

      <fieldset className="mt-6 grid gap-4 sm:grid-cols-2" disabled={busy}>
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
