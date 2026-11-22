"use client"

// The only thing /pitch shows before the password is right. It says nothing
// about the deck. The form posts to /pitch/unlock and works without
// JavaScript (a wrong password comes back as /pitch?wrong=1); with JavaScript
// it stays on the page, says "That's not it" and keeps the slide the address
// names (#5) for when it opens.
import { useRef, useState, type FormEvent } from "react"

export function PasswordScreen({ wrong: wrongAtFirst = false }: { wrong?: boolean }) {
  const [wrong, setWrong] = useState(wrongAtFirst)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch("/pitch/unlock", {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(e.currentTarget),
      })
      if (res.ok) {
        // Load the page again, now with the cookie. Replacing the address with
        // itself would only move to the hash, so reload unless there is a
        // query (?wrong=1) to drop.
        if (window.location.search) window.location.replace(`/pitch${window.location.hash}`)
        else window.location.reload()
        return
      }
      setWrong(true)
      input.current?.select()
    } catch {
      setWrong(true)
    }
    setBusy(false)
  }

  return (
    <main className="pd-gate">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="pd-gate-mark" src="/brand/majnu-wordmark-on-dark.svg" alt="Majnu" width={200} height={53} />
      <form className="pd-gate-form" method="post" action="/pitch/unlock" onSubmit={onSubmit}>
        <label htmlFor="pd-password" className="pd-gate-label">
          Password
        </label>
        <div className="pd-gate-row">
          <input
            ref={input}
            id="pd-password"
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={wrong || undefined}
            aria-describedby={wrong ? "pd-password-error" : undefined}
            onInput={() => setWrong(false)}
            className="pd-gate-input"
          />
          <button type="submit" className="pd-gate-button" disabled={busy}>
            Open
          </button>
        </div>
        <p id="pd-password-error" className="pd-gate-error" role="status">
          {wrong ? "That's not it" : ""}
        </p>
      </form>
    </main>
  )
}
