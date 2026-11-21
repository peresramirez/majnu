import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { Wordmark } from "@/components/brand/wordmark"
import { site } from "@/lib/site"

export default function Footer() {
  return (
    <footer className="flex items-center justify-between gap-4 py-6">
      <Link href="/" aria-label={`${site.name} home`} className="rounded">
        <Wordmark on="light" width={96} className="dark:hidden" />
        <Wordmark on="dark" width={96} className="hidden dark:block" />
      </Link>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <a href="mailto:hello@majnu.app" className="hover:text-foreground">hello@majnu.app</a>
        <ThemeToggle />
      </div>
    </footer>
  )
}
