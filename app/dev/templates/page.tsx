// /dev/templates: every template from lib/letters/fixtures.ts in a phone-sized
// frame, all calendar doors open as in the owner's preview, plus the advent
// calendar locked as of today. Each frame is an iframe of /dev/templates/<id>,
// so templates get a real 375 px viewport.
import Link from "next/link"
import { Wordmark } from "@/components/brand/wordmark"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { templates } from "@/lib/letters/templates"
import { site } from "@/lib/site"
import { PALETTES } from "./fixture-letter"
import { SharePreview } from "./share-preview"

export const dynamic = "force-dynamic"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-rose"

function themeOf(id: string) {
  const f = (letterFixtures as Record<string, { theme: { palette: string; font: string } }>)[id] ?? (calendarFixtures as Record<string, { theme: { palette: string; font: string } }>)[id]
  return f?.theme
}

function Frame({ src, title, caption, id }: { src: string; title: string; caption: string; id: string }) {
  return (
    <figure className="w-full max-w-[391px]">
      <div className="overflow-hidden rounded-[34px] bg-black p-2 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.8)] ring-1 ring-white/10">
        <iframe src={src} title={title} loading="lazy" className="block h-[740px] w-full rounded-[26px] bg-night-plum" />
      </div>
      <figcaption className="mt-3 px-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-[22px] leading-tight">{title}</p>
          <a href={src} target="_blank" rel="noopener noreferrer" className={`shrink-0 rounded text-[13px] text-night-lilac underline underline-offset-4 hover:text-night-petal ${focusRing}`}>
            Full screen
          </a>
        </div>
        <p className="mt-0.5 text-[13px] text-night-lilac">{caption}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PALETTES.map((p) => (
            <a
              key={p}
              href={`/dev/templates/${id}?palette=${p}${src.includes("live=1") ? "&live=1" : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-full px-2.5 py-1 text-[12px] text-night-lilac ring-1 ring-inset ring-white/15 hover:text-night-petal ${focusRing}`}
            >
              {p}
            </a>
          ))}
        </div>
      </figcaption>
    </figure>
  )
}

export default function DevTemplatesPage() {
  return (
    <div className="dark min-h-[100svh] bg-night-plum text-night-petal">
      <header className="mx-auto flex max-w-[1320px] flex-wrap items-center justify-between gap-4 px-4 pb-6 pt-8 sm:px-8">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Majnu home" className={`rounded ${focusRing}`}>
            <Wordmark width={112} />
          </Link>
          <span className="text-[13px] uppercase tracking-[0.2em] text-night-lilac">Templates</span>
        </div>
        <nav aria-label="Demo links" className="flex flex-wrap gap-2">
          {["demo-letter", "demo-gift", "demo-calendar"].map((slug) => (
            <a key={slug} href={`/l/${slug}`} className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1 ring-inset ring-night-petal/25 hover:bg-white/5 ${focusRing}`}>
              /l/{slug}
            </a>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-[1320px] px-4 pb-20 sm:px-8">
        <p className="max-w-[60ch] text-[15px] leading-relaxed text-night-lilac">
          Every template with its fixture from <code className="text-night-petal">lib/letters/fixtures.ts</code>. Calendars show every door open, as in the
          owner&apos;s preview; the last frame locks the advent calendar as of today. The palette links open a template in another mood.
        </p>

        <div className="mt-10 grid justify-items-center gap-x-8 gap-y-14 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => {
            const theme = themeOf(t.id)
            return (
              <Frame
                key={t.id}
                id={t.id}
                src={`/dev/templates/${t.id}`}
                title={t.name}
                caption={`${t.id} · ${theme?.palette} · ${theme?.font}`}
              />
            )
          })}
          <Frame
            id="advent-classic"
            src="/dev/templates/advent-classic?live=1"
            title="Advent calendar, today"
            caption="advent-classic · doors locked as of today in Europe/Berlin"
          />
        </div>

        <section className="mt-20 max-w-[860px]">
          <h2 className="font-display text-[28px]">Share panel</h2>
          <p className="mt-1 text-[14px] text-night-lilac">As the create page shows it, on the night palette.</p>
          <div className="mt-5">
            <SharePreview url={`${site.url}/l/demo-letter`} />
          </div>
        </section>
      </main>
    </div>
  )
}
