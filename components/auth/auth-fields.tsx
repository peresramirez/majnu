import type React from "react"
import { Loader2 } from "lucide-react"
import { FcGoogle } from "react-icons/fc"

// Shared look for the sign-in and sign-up forms (night palette).
export const inputClass =
  "h-12 rounded-xl border-night-petal/15 bg-night-velvet px-4 text-base text-night-petal placeholder:text-night-lilac/60 focus-visible:ring-night-rose"
export const labelClass = "text-sm font-medium text-night-petal"
export const submitClass =
  "h-12 w-full rounded-full bg-night-rose text-[15px] font-semibold text-night-plum hover:bg-[#F1C4A9]"

type GoogleButtonProps = { onClick: () => void; loading: boolean; disabled: boolean; label?: string }

export function GoogleButton({ onClick, loading, disabled, label = "Continue with Google" }: GoogleButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-night-petal text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FcGoogle className="h-5 w-5" aria-hidden="true" />}
      {label}
    </button>
  )
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-4 text-xs text-night-lilac/80">
      <span className="h-px flex-1 bg-night-petal/15" />
      or with email
      <span className="h-px flex-1 bg-night-petal/15" />
    </div>
  )
}

// A quiet note above a form, e.g. for guests ("everything you made comes with you").
export function AuthNote({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="rounded-2xl bg-night-velvet px-4 py-3.5 text-sm leading-relaxed text-night-lilac ring-1 ring-inset ring-night-petal/10">
      {children}
    </div>
  )
}

// Shown to a guest when Google could not be added to the guest account (the
// Google account already has a Majnu account, or manual linking is off): they
// may still sign in to that account, and what they made as a guest stays behind.
export function GoogleAnyway(props: Omit<GoogleButtonProps, "label">) {
  return (
    <div className="space-y-2">
      <GoogleButton {...props} label="Sign in with Google anyway" />
      <p className="text-center text-xs text-night-lilac/80">What you made as a guest stays with the guest account.</p>
    </div>
  )
}
