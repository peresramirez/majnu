// /dev/templates: every template from lib/letters/fixtures.ts in a phone-sized
// frame, all calendar doors open as in the owner's preview, plus the advent
// calendar locked as of today. Each frame is an iframe of /dev/templates/<id>,
// so templates get a real 375 px viewport.
import Link from "next/link"
import { Wordmark } from "@/components/brand/wordmark"
import { TemplateCard } from "@/components/letters/template-card"
import { calendarFixtures, letterFixtures } from "@/lib/letters/fixtures"
import { templates } from "@/lib/letters/templates"
import { site } from "@/lib/site"
import { PALETTES } from "./fixture-letter"
import { SharePreview } from "./share-preview"

export const dynamic = "force-dynamic"

const focusRing = "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-night-rose"

// States the issues ask to check: calendars with 0, 1, 12 and 24 doors open,
// countdowns of 3, 7 and 24 days, invitations with no event.
const STATES: { title: string; links: [string, string][] }[] = [
  {
    title: "Advent calendar",
    links: [
      ["None open", "/dev/templates/advent-classic?today=2026-11-30"],
      ["1 door open", "/dev/templates/advent-classic?today=2026-12-01"],
      ["12 doors open", "/dev/templates/advent-classic?today=2026-12-12"],
      ["24 doors open", "/dev/templates/advent-classic?today=2026-12-24"],
    ],
  },
  {
    title: "Countdown",
    links: [
      ["3 days", "/dev/templates/countdown?days=3"],
      ["7 days", "/dev/templates/countdown?days=7"],
      ["24 days", "/dev/templates/countdown?days=24"],
      ["3 days, 1 open", "/dev/templates/countdown?days=3&today=2027-03-01"],
      ["24 days, 12 open", "/dev/templates/countdown?days=24&today=2027-03-12"],
    ],
  },
  {
    title: "Invitations",
    links: [
      ["Wedding, no event", "/dev/templates/wedding-invite?event=0"],
      ["Party, no event", "/dev/templates/party-invite?event=0"],
      ["Wedding, script", "/dev/templates/wedding-invite?font=script&palette=sage"],
      ["Party, night", "/dev/templates/party-invite?palette=night&font=serif"],
      ["Wedding, as a guest", "/dev/templates/wedding-invite?guest=1"],
    ],
  },
  {
    // Like the 3D boxes: with reduced motion or no WebGL the envelope is a
    // still drawing and the button opens the invitation at once.
    title: "3D wedding envelope",
    links: [
      ["As a guest (gift list)", "/dev/templates/wedding-envelope-3d?guest=1"],
      ["With a voice note", "/dev/templates/wedding-envelope-3d?audio=1"],
      ["No event", "/dev/templates/wedding-envelope-3d?event=0"],
      ["Rose", "/dev/templates/wedding-envelope-3d?palette=rose"],
      ["Ink", "/dev/templates/wedding-envelope-3d?palette=ink"],
      ["Sage, script", "/dev/templates/wedding-envelope-3d?palette=sage&font=script"],
      ["Petal, sans", "/dev/templates/wedding-envelope-3d?palette=petal&font=sans"],
    ],
  },
  {
    // The 3D boxes need WebGL and motion; with reduced motion or no WebGL they
    // show a still drawing instead (check with the browser's rendering
    // settings, or block WebGL).
    title: "3D boxes and the map",
    links: [
      ["3D box, petal", "/dev/templates/gift-box-3d?palette=petal&font=sans"],
      ["3D box, script", "/dev/templates/gift-box-3d?palette=sage&font=script"],
      ["3D box, ink", "/dev/templates/gift-box-3d?palette=ink"],
      ["Party box, no event", "/dev/templates/party-box?event=0"],
      ["Party box, night", "/dev/templates/party-box?palette=night&font=serif"],
      ["Map, night", "/dev/templates/treasure-map?palette=night"],
      ["Map, script", "/dev/templates/treasure-map?palette=rose&font=script"],
    ],
  },
]

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

        <section className="mt-20" aria-labelledby="cards-title">
          <h2 id="cards-title" className="font-display text-[28px]">Template cards</h2>
          <p className="mt-1 text-[14px] text-night-lilac">
            <code className="text-night-petal">&lt;TemplateCard id /&gt;</code> for every template: a still drawing from its fixture, no script. The last
            row shows the responsive layout (picture beside the words on phones).
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {templates.map((t) => (
              <li key={t.id}>
                <TemplateCard id={t.id} className="h-full" />
              </li>
            ))}
          </ul>
          <ul className="mt-6 grid max-w-[860px] gap-4 md:grid-cols-3">
            {(["classic-envelope", "gift-reveal", "advent-classic"] as const).map((id) => (
              <li key={id}>
                <TemplateCard id={id} orientation="responsive" className="h-full" />
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-20 max-w-[860px]" aria-labelledby="states-title">
          <h2 id="states-title" className="font-display text-[28px]">States</h2>
          <p className="mt-1 text-[14px] text-night-lilac">
            Each link opens one template full screen in a state worth checking at 375 px. <code className="text-night-petal">?today=</code> locks doors as
            the public page would on that date; <code className="text-night-petal">?days=</code> sets the countdown&apos;s length.
          </p>
          <dl className="mt-6 space-y-5">
            {STATES.map((group) => (
              <div key={group.title}>
                <dt className="text-[13px] font-semibold uppercase tracking-[0.16em] text-night-lilac">{group.title}</dt>
                <dd className="mt-2 flex flex-wrap gap-2">
                  {group.links.map(([label, href]) => (
                    <a
                      key={href}
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ring-1 ring-inset ring-night-petal/25 hover:bg-white/5 ${focusRing}`}
                    >
                      {label}
                    </a>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </section>

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
