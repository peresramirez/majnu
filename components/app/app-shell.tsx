"use client"

import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Gift, Moon, PenLine, type LucideIcon } from "lucide-react"
import { Wordmark } from "@/components/brand/wordmark"
import { AccountMenu } from "./account-menu"
import type { SessionUser } from "./session"
import { focusRing } from "./styles"

type Tab = { href: string; label: string; icon: LucideIcon; isActive: (pathname: string) => boolean }

// The three tabs of the signed-in app (docs/plan.md). /create/<id> belongs to Create.
const tabs: Tab[] = [
  {
    href: "/dashboard",
    label: "Create",
    icon: PenLine,
    isActive: (p) => p === "/dashboard" || p.startsWith("/create"),
  },
  { href: "/dashboard/gifts", label: "My gifts", icon: Gift, isActive: (p) => p.startsWith("/dashboard/gifts") },
  { href: "/dashboard/plan", label: "Plan", icon: Moon, isActive: (p) => p.startsWith("/dashboard/plan") },
]

// Header with the wordmark, top tabs from md up, and a bottom tab bar on phones.
// The shell is exactly one screen tall and <main> scrolls, so the create chat
// can pin its composer above the tab bar. While the composer has focus on a
// phone, the tab bar steps aside to give the keyboard the room.
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const pathname = usePathname() ?? ""

  return (
    <div className="dark group/shell flex h-screen h-dvh flex-col bg-night-plum text-night-petal">
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-night-rose px-4 py-2 font-semibold text-night-plum focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      <header className="flex-none border-b border-night-petal/10 bg-night-plum pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center gap-8 px-4 md:h-16 md:px-6">
          <Link href="/dashboard" aria-label="Majnu, create a gift" className={`flex-none rounded ${focusRing}`}>
            <Wordmark width={108} />
          </Link>
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {tabs.map((tab) => {
                const active = tab.isActive(pathname)
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      className={`inline-flex items-center rounded-full px-4 py-2 text-[15px] font-medium transition-colors duration-200 ease-calm ${focusRing} ${
                        active ? "bg-night-velvet text-night-petal ring-1 ring-inset ring-night-petal/10" : "text-night-lilac hover:text-night-petal"
                      }`}
                    >
                      {tab.label}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
          <div className="ml-auto">
            <AccountMenu user={user} />
          </div>
        </div>
      </header>

      <main id="main" className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="flex-none border-t border-night-petal/10 bg-night-plum pb-[env(safe-area-inset-bottom)] md:hidden group-has-[textarea[data-composer]:focus]/shell:hidden"
      >
        <ul className="grid grid-cols-3">
          {tabs.map((tab) => {
            const active = tab.isActive(pathname)
            const Icon = tab.icon
            return (
              <li key={tab.href}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors duration-200 ease-calm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-night-rose ${
                    active ? "text-night-rose" : "text-night-lilac hover:text-night-petal"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
