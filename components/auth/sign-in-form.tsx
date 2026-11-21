"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signInWithGoogle } from "@/app/auth/actions"
import { nextPathFromSearch, withNext } from "@/lib/billing/next-path"
import { createClient } from "@/lib/supabase/client"
import { signInSchema } from "@/lib/validations"
import { AuthNote, GoogleAnyway, GoogleButton, OrDivider, inputClass, labelClass, submitClass } from "./auth-fields"
import { callbackErrorMessage, friendlyAuthError, offersGoogleAnyway } from "./auth-errors"
import { useAuth } from "./auth-provider"
import { signInWithEmail } from "./email-auth"
import { useTurnstile } from "./turnstile"

const linkClass = "rounded font-semibold text-night-petal underline-offset-4 hover:underline"

export default function SignInForm() {
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Set when linking Google to the guest account was refused: the guest may
  // still sign in to that Google account, leaving the guest account behind.
  const [googleAnyway, setGoogleAnyway] = useState(false)
  const router = useRouter()
  const busy = isEmailLoading || isGoogleLoading
  const guest = useAuth().user?.is_anonymous === true
  const turnstile = useTurnstile("signin")
  // Where to go after signing in: ?next=... or ?plan=full-moon (the landing
  // page's "Choose Full moon"), and ?auth_error=... from the auth callback.
  // Read after mount, so the page stays static.
  const [next, setNext] = useState<string | null>(null)
  useEffect(() => {
    const search = new URLSearchParams(window.location.search)
    setNext(nextPathFromSearch(search))
    const code = search.get("auth_error")
    const message = callbackErrorMessage(code)
    if (message) {
      setError(message)
      setGoogleAnyway(offersGoogleAnyway(code))
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  })

  const handleEmailSignIn = async (values: z.infer<typeof signInSchema>) => {
    setError(null)
    setGoogleAnyway(false)
    setIsEmailLoading(true)
    try {
      const captchaToken = await turnstile.getToken()
      const result = await signInWithEmail(createClient().auth, { ...values, captchaToken })
      turnstile.reset()
      if (!result.ok) {
        setError(friendlyAuthError(result.error, "We couldn't sign you in. Try again."))
        return
      }
      router.push(next ?? "/dashboard")
      router.refresh()
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign you in. Try again."))
    } finally {
      setIsEmailLoading(false)
    }
  }

  // For a guest this first tries to add Google to the guest account; with
  // `switchAccount` it signs in to the Google account's own Majnu account.
  const handleGoogleSignIn = async (switchAccount = false) => {
    setIsGoogleLoading(true)
    setError(null)
    setGoogleAnyway(false)
    try {
      // Returns only when Google sign-in could not start; otherwise the browser leaves for Google.
      const result = await signInWithGoogle(next, { switchAccount })
      if (result?.error) {
        setError(friendlyAuthError(result.error, "We couldn't reach Google. Try again."))
        setGoogleAnyway(guest && offersGoogleAnyway(result.error.code))
        setIsGoogleLoading(false)
      }
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't reach Google. Try again."))
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {guest && (
        <AuthNote>
          You&apos;re using Majnu as a guest. To keep what you made,{" "}
          <Link href={withNext("/signup", next)} className={linkClass}>
            create an account
          </Link>{" "}
          instead: signing in to another account leaves it with the guest account.
        </AuthNote>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {googleAnyway ? (
        <GoogleAnyway onClick={() => handleGoogleSignIn(true)} loading={isGoogleLoading} disabled={busy} />
      ) : (
        <GoogleButton onClick={() => handleGoogleSignIn()} loading={isGoogleLoading} disabled={busy} />
      )}
      <OrDivider />

      <form onSubmit={handleSubmit(handleEmailSignIn)} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClass}>Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" disabled={busy} className={inputClass} {...register("email")} />
          {errors.email && <p className="text-sm text-[#F2A7A7]">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className={labelClass}>Password</Label>
          <Input id="password" type="password" autoComplete="current-password" disabled={busy} className={inputClass} {...register("password")} />
          {errors.password && <p className="text-sm text-[#F2A7A7]">{errors.password.message}</p>}
        </div>
        {/* Cloudflare Turnstile, invisible: nothing shows here. */}
        <div ref={turnstile.containerRef} />
        <Button type="submit" className={submitClass} disabled={busy}>
          {isEmailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-night-lilac">
        New to Majnu?{" "}
        <Link href={withNext("/signup", next)} className={linkClass}>
          Create an account
        </Link>
      </p>
    </div>
  )
}
