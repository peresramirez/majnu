"use client"

import { useState } from "react"
import { ArrowUpRight, Gift } from "lucide-react"
import type { GiftOption } from "@/lib/finder/events"
import { quietLink, smallButton, smallPrimary } from "./styles"
import { productImageSrc, shopHref, shopName } from "./urls"

// A product photo from the shop, loaded only when it scrolls near. The box has
// a fixed shape, so nothing moves when it arrives, and a missing or broken
// image leaves a quiet placeholder instead of a broken-image icon.
export function ProductImage({ src, className = "" }: { src?: string; className?: string }) {
  const safe = productImageSrc(src)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  return (
    <span className={`relative block overflow-hidden bg-night-petal/[0.06] ${className}`}>
      {safe && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={safe}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-calm ${loaded ? "opacity-100" : "opacity-0"}`}
        />
      ) : null}
      {(!safe || failed || !loaded) && (
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <Gift className="h-7 w-7 text-night-lilac/40" strokeWidth={1.5} />
        </span>
      )}
    </span>
  )
}

type Props = {
  option: GiftOption
  recommended: boolean
  onChoose: (option: GiftOption) => void
  disabled?: boolean
}

// One gift idea: photo, shop and price, title, why it suits them, and the two
// things to do with it. A row on phones, a column from md up.
export function GiftOptionCard({ option, recommended, onChoose, disabled }: Props) {
  const href = shopHref(option.url)
  const shop = shopName(option)
  const meta = [shop, option.price].filter(Boolean).join(" · ")
  return (
    <article
      aria-label={recommended ? `${option.title}, recommended` : option.title}
      className={`flex h-full gap-3 rounded-[22px] bg-night-velvet p-3 ring-1 ring-inset md:flex-col md:gap-0 md:p-0 ${
        recommended ? "ring-night-petal/30" : "ring-night-petal/10"
      }`}
    >
      <span className="relative block w-24 shrink-0 self-start md:w-full">
        <ProductImage src={option.imageUrl} className="aspect-square rounded-2xl md:aspect-[4/3] md:rounded-b-none md:rounded-t-[22px]" />
        {recommended && (
          <span className="absolute left-3 top-3 hidden rounded-full bg-night-orchid px-2.5 py-1 text-xs font-semibold tracking-wide text-night-plum md:inline-block">
            Recommended
          </span>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col md:p-4 md:pt-3.5">
        {recommended && (
          <span className="mb-1.5 self-start rounded-full bg-night-orchid px-2 py-0.5 text-[11px] font-semibold tracking-wide text-night-plum md:hidden">
            Recommended
          </span>
        )}
        {meta && <p className="truncate text-[13px] font-medium text-night-lilac">{meta}</p>}
        <h3 className="mt-0.5 font-display text-lg leading-snug text-night-petal md:text-xl">{option.title}</h3>
        {option.reason && <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-night-lilac">{option.reason}</p>}
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-3">
          <button
            type="button"
            onClick={() => onChoose(option)}
            disabled={disabled}
            aria-label={`Choose ${option.title}`}
            className={recommended ? smallPrimary : smallButton}
          >
            Choose
          </button>
          {href && (
            <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={`inline-flex items-center gap-1 text-sm ${quietLink}`}>
              View in shop
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">(opens {shop ?? "the shop"} in a new tab)</span>
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
