"use client"

import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Gift, LayoutTemplate, Moon, PenLine, Search, type LucideIcon } from "lucide-react"
import { Wordmark } from "@/components/brand/wordmark"
import { AccountMenu } from "./account-menu"
import { GuestNotice } from "./guest-notice"
import type { SessionUser } from "./session"
import { focusRing } from "./styles"
import { activeTab, appTabs, type AppTab, type TabId } from "./tabs"

// The Templates tab (issue #40) sits after Letters & invitations. It is added
// here rather than in tabs.ts, which this change does not own; moving it there
// (with its test) is a follow-up.
type ShellTabId = TabId | "templates"
type ShellTab = Omit<AppTab, "id"> & { id: ShellTabId }
const templatesTab: ShellTab = { id: "templates", href: "/dashboard/templates", label: "Templates", shortLabel: "Templates" }
const shellTabs: readonly ShellTab[] = appTabs.flatMap((tab): ShellTab[] => (tab.id === "letters" ? [tab, templatesTab] : [tab]))

function shellTab(pathname: string): ShellTabId | null {
  if (pathname === "/dashboard/templates" || pathname.startsWith("/dashboard/templates/")) return "templates"
  return activeTab(pathname)
}

const icons: Record<ShellTabId, LucideIcon> = { find: Search, letters: PenLine, templates: LayoutTemplate, gifts: Gift, plan: Moon }

// Header with the wordmark, top tabs from md up, and a bottom tab bar on phones.
// The shell is exactly one screen tall and <main> scrolls, so the create chat
// can pin its composer above the tab bar. While the composer has focus on a
// phone, the tab bar steps aside to give the keyboard the room.
export function AppShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const current = shellTab(usePathname() ?? "")

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
          <Link href="/dashboard/find" aria-label="Majnu, find a gift" className={`flex-none rounded ${focusRing}`}>
            <Wordmark width={108} />
          </Link>
          <nav aria-label="Main" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {shellTabs.map((tab) => {
                const active = tab.id === current
                return (
                  <li key={tab.id}>
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

      {user.isGuest && <GuestNotice />}

      <main id="main" className="min-h-0 flex-1 overflow-y-auto">
        {children}
      </main>

      <nav
        aria-label="Main"
        className="flex-none border-t border-night-petal/10 bg-night-plum pb-[env(safe-area-inset-bottom)] md:hidden group-has-[textarea[data-composer]:focus]/shell:hidden"
      >
        <ul className="grid grid-cols-5">
          {shellTabs.map((tab) => {
            const active = tab.id === current
            const Icon = icons[tab.id]
            return (
              <li key={tab.id}>
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition-colors duration-200 ease-calm focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-night-rose ${
                    active ? "text-night-rose" : "text-night-lilac hover:text-night-petal"
                  }`}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2 : 1.6} aria-hidden="true" />
                  <span>
                    {tab.shortLabel}
                    {tab.label !== tab.shortLabel && <span className="sr-only">{tab.label.slice(tab.shortLabel.length)}</span>}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
