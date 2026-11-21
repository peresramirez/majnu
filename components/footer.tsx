import Link from "next/link"
import { ThemeToggle } from "@/components/theme-toggle"
import { site } from "@/lib/site"

export default function Footer() {
  return (
    <footer className="flex items-center justify-between gap-4 py-6">
      <Link href="/" className="text-lg font-extrabold tracking-tight">
        {site.name}
      </Link>
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>
          © {new Date().getFullYear()} {site.name}
        </span>
        <ThemeToggle />
      </div>
    </footer>
  )
}
