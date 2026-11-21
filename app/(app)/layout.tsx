import type React from "react"
import Footer from "@/components/footer"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-7xl flex-1 px-4">{children}</main>
      <hr className="w-full border-t" />
      <div className="mx-auto w-full max-w-7xl px-4">
        <Footer />
      </div>
    </div>
  )
}
