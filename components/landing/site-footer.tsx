import Link from "next/link"
import { Wordmark } from "@/components/brand/wordmark"

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"

const links = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/impressum", label: "Impressum" },
]

// Footer for the landing and legal pages (night palette on every page).
export function SiteFooter() {
  return (
    <footer className="border-t border-night-petal/10 bg-night-deep px-5 py-10 text-sm text-night-lilac sm:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" aria-label="Majnu home" className={`self-start rounded sm:self-auto ${focusRing}`}>
          <Wordmark width={104} />
        </Link>
        <nav aria-label="Legal and contact" className="flex flex-wrap gap-x-5 gap-y-2">
          {links.map(({ href, label }) => (
            <Link key={href} href={href} className={`rounded hover:text-night-petal ${focusRing}`}>
              {label}
            </Link>
          ))}
          <a href="mailto:hello@majnu.app" className={`rounded text-night-petal hover:underline hover:underline-offset-4 ${focusRing}`}>
            hello@majnu.app
          </a>
        </nav>
        <p>© {new Date().getFullYear()} Majnu</p>
      </div>
    </footer>
  )
}
