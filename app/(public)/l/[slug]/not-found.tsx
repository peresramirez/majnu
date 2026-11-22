import { Wordmark } from "@/components/brand/wordmark"

// A link that leads nowhere: a mistyped address, or a gift that was deleted.
export default function LetterNotFound() {
  return (
    <main
      className="flex min-h-[100svh] flex-col items-center justify-center px-6 text-center text-night-petal"
      style={{ background: "radial-gradient(120% 100% at 72% 30%, #3E2759 0%, #1B1226 58%, #100A17 100%)" }}
    >
      <Wordmark width={120} />
      <h1 className="mt-12 font-display text-[34px] leading-tight">There is no gift at this link</h1>
      <p className="mt-3 max-w-[32ch] text-[16px] leading-relaxed text-night-lilac">
        Check the link you were sent, or ask the person who sent it for a new one.
      </p>
      <a
        href="/"
        className="mt-10 rounded-full bg-night-rose px-6 py-3 text-[15px] font-semibold text-night-plum focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"
      >
        Create a gift
      </a>
    </main>
  )
}
