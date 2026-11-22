// /dev/finder: the landing page's gift finder against a scripted event stream
// (mock-transport.ts), so every state can be built and checked before the API
// lands and without spending model calls. Never indexed (see ../layout.tsx).
import type { Metadata } from "next"
import { Wordmark } from "@/components/brand/wordmark"
import { FinderWorkbench } from "./workbench"

export const metadata: Metadata = {
  title: "Gift finder",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
}

export default function DevFinderPage() {
  return (
    <div className="min-h-[100svh] bg-[radial-gradient(120%_80%_at_72%_18%,#3E2759_0%,#1B1226_55%,#100A17_100%)] text-night-petal">
      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Wordmark width={112} />
          <p className="text-right text-xs font-semibold uppercase tracking-[0.2em] text-night-lilac">Finder workbench</p>
        </div>
        <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-night-lilac">
          The landing page&rsquo;s finder on a scripted stream. Each chip is one scenario; type anything for the first search.
          Write &ldquo;fail&rdquo; in the note when wrapping to see the wrap error.
        </p>
        <div className="mt-10">
          <FinderWorkbench />
        </div>
      </div>
    </div>
  )
}
