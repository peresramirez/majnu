// Picks the template component for a letter. Part of the contract: the create
// page's preview and /l/[slug] both render through <LetterRenderer>. The real
// templates replace this placeholder (issue #15).
import type { PublicLetter } from "@/lib/letters/schema"

export function LetterRenderer({ letter }: { letter: PublicLetter }) {
  const c = letter.content
  return (
    <div className="flex min-h-[100svh] items-center justify-center bg-[#1B1226] p-6 text-[#F5EAF1]">
      <div className="max-w-lg">
        <p className="text-sm opacity-70">For {c.recipientName}</p>
        <h1 className="mt-2 font-display text-4xl">{c.headline}</h1>
        {letter.kind === "letter" ? (
          letter.content.body.map((p, i) => (
            <p key={i} className="mt-4 leading-relaxed">
              {p}
            </p>
          ))
        ) : (
          <p className="mt-4 leading-relaxed">{letter.content.intro}</p>
        )}
      </div>
    </div>
  )
}
