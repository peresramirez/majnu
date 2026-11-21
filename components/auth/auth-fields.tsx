import { Loader2 } from "lucide-react"
import { FcGoogle } from "react-icons/fc"

// Shared look for the sign-in and sign-up forms (night palette).
export const inputClass =
  "h-12 rounded-xl border-night-petal/15 bg-night-velvet px-4 text-base text-night-petal placeholder:text-night-lilac/60 focus-visible:ring-night-rose"
export const labelClass = "text-sm font-medium text-night-petal"
export const submitClass =
  "h-12 w-full rounded-full bg-night-rose text-[15px] font-semibold text-night-plum hover:bg-[#F1C4A9]"

export function GoogleButton({ onClick, loading, disabled }: { onClick: () => void; loading: boolean; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-night-petal text-[15px] font-semibold text-night-plum transition-colors duration-200 ease-calm hover:bg-white disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FcGoogle className="h-5 w-5" aria-hidden="true" />}
      Continue with Google
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

// Supabase's messages are written for developers; say what happened and what to do.
// Errors returned from server actions arrive as plain objects, not Error instances.
export function friendlyAuthError(err: unknown, fallback: string) {
  const message = typeof err === "object" && err && "message" in err && typeof err.message === "string" ? err.message : undefined
  if (!message) return fallback
  const m = message.toLowerCase()
  if (m.includes("invalid login credentials")) return "That email and password don't match. Check them and try again."
  if (m.includes("email not confirmed")) return "Confirm your email first: open the link we sent you, then sign in."
  if (m.includes("already registered")) return "There's already an account with this email. Sign in instead."
  if (m.includes("rate limit")) return "Too many attempts. Wait a minute and try again."
  return message
}
