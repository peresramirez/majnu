"use client"

import Link from "next/link"
import { useTransition } from "react"
import { Loader2, LogOut, Mail } from "lucide-react"
import { signOut } from "@/app/auth/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { SessionUser } from "./session"
import { focusRing } from "./styles"

const item = "cursor-pointer rounded-lg px-3 py-2.5 text-[15px] text-night-petal focus:bg-night-petal/10 focus:text-night-petal"
const legal = "cursor-pointer rounded-lg px-3 py-1.5 text-sm text-night-lilac focus:bg-night-petal/10 focus:text-night-petal"

export function AccountMenu({ user }: { user: SessionUser }) {
  const [pending, startTransition] = useTransition()
  const initial = (user.name ?? user.email ?? "?").trim().charAt(0).toUpperCase() || "?"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Your account"
        className={`grid h-9 w-9 place-items-center rounded-full bg-night-velvet text-sm font-semibold text-night-petal ring-1 ring-inset ring-night-petal/15 transition-colors duration-200 ease-calm hover:ring-night-petal/40 data-[state=open]:ring-night-rose/60 ${focusRing}`}
      >
        {initial}
      </DropdownMenuTrigger>
      {/* Menus render outside the shell, so they bring the night palette with them. */}
      <DropdownMenuContent align="end" sideOffset={8} className="dark w-64 rounded-2xl border-night-petal/10 bg-night-velvet p-1.5 text-night-petal shadow-xl shadow-black/40">
        <DropdownMenuLabel className="px-3 py-2.5 font-normal">
          {user.name && <span className="block truncate text-[15px] font-medium text-night-petal">{user.name}</span>}
          <span className="block truncate text-sm text-night-lilac">{user.email ?? "Signed in"}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-night-petal/10" />
        <DropdownMenuItem asChild className={item}>
          <a href="mailto:hello@majnu.app">
            <Mail aria-hidden="true" />
            Write to us
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          className={item}
          disabled={pending}
          onSelect={(e) => {
            e.preventDefault()
            startTransition(async () => {
              await signOut()
            })
          }}
        >
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LogOut aria-hidden="true" />}
          Sign out
        </DropdownMenuItem>
        <DropdownMenuSeparator className="bg-night-petal/10" />
        <div className="flex flex-wrap px-1 pb-1">
          <DropdownMenuItem asChild className={legal}>
            <Link href="/privacy">Privacy</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={legal}>
            <Link href="/terms">Terms</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className={legal}>
            <Link href="/impressum">Impressum</Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
