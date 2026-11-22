"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle, Loader2, MailCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signInWithGoogle } from "@/app/auth/actions"
import { afterAuthPath } from "@/app/auth/destination"
import { nextPathFromSearch, withNext } from "@/lib/billing/next-path"
import { createClient } from "@/lib/supabase/client"
import { signUpSchema } from "@/lib/validations"
import { AuthNote, GoogleAnyway, GoogleButton, OrDivider, inputClass, labelClass, submitClass } from "./auth-fields"
import { friendlyAuthError, offersGoogleAnyway } from "./auth-errors"
import { useAuth } from "./auth-provider"
import { authCallbackUrl } from "./callback-url"
import { signUpWithEmail } from "./email-auth"
import { useTurnstile } from "./turnstile"

const linkClass = "rounded font-semibold text-night-petal underline-offset-4 hover:underline"

export default function SignUpForm() {
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [googleAnyway, setGoogleAnyway] = useState(false)
  const [confirm, setConfirm] = useState<{ email: string; guest: boolean } | null>(null)
  const router = useRouter()
  const busy = isEmailLoading || isGoogleLoading
  const guest = useAuth().user?.is_anonymous === true
  const turnstile = useTurnstile("signup")
  // Where to go after signing up: a same-site ?next=... (an old ?plan=full-moon
  // link from the retired subscription means Purchases), otherwise the gift
  // finder. Read after mount, so the page stays static.
  const [next, setNext] = useState<string | null>(null)
  useEffect(() => setNext(nextPathFromSearch(new URLSearchParams(window.location.search))), [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof signUpSchema>>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { email: "", password: "" },
  })

  const handleEmailSignUp = async (values: z.infer<typeof signUpSchema>) => {
    setError(null)
    setGoogleAnyway(false)
    setIsEmailLoading(true)
    try {
      const captchaToken = await turnstile.getToken()
      // A guest's confirmation link lands on the auth callback, which signs
      // this browser in to the upgraded account and continues to `next`.
      const confirmUrl = authCallbackUrl(process.env.NEXT_PUBLIC_SITE_URL || window.location.origin, next)
      const result = await signUpWithEmail(createClient().auth, { ...values, captchaToken, confirmUrl })
      turnstile.reset()
      if (!result.ok) {
        setError(friendlyAuthError(result.error, "We couldn't create your account. Try again.", { guest: result.upgradedGuest }))
        return
      }
      // With email confirmation on, there is no session until the link is opened.
      if (result.status === "confirm_email") {
        setConfirm({ email: values.email, guest: result.upgradedGuest })
        return
      }
      router.push(afterAuthPath(next))
      router.refresh()
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't create your account. Try again."))
    } finally {
      setIsEmailLoading(false)
    }
  }

  // For a guest this adds Google to the guest account, so their gifts stay.
  const handleGoogleSignUp = async (switchAccount = false) => {
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

  if (confirm) {
    return (
      <div className="rounded-3xl bg-night-velvet p-7 ring-1 ring-inset ring-night-petal/10" role="status">
        <MailCheck className="h-7 w-7 text-night-rose" aria-hidden="true" />
        <h2 className="mt-4 font-display text-2xl">Check your email</h2>
        {confirm.guest ? (
          <>
            <p className="mt-2 leading-relaxed text-night-lilac">
              We sent a link to <span className="text-night-petal">{confirm.email}</span>. Open it in this browser to finish
              creating your account. Everything you made as a guest comes with you.
            </p>
            <p className="mt-3 leading-relaxed text-night-lilac">Until then, you can keep going as a guest.</p>
            <Link href={afterAuthPath(next)} className={`mt-6 inline-block ${linkClass}`}>
              Back to Majnu
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 leading-relaxed text-night-lilac">
              We sent a link to <span className="text-night-petal">{confirm.email}</span>. Open it to confirm your account,
              then sign in.
            </p>
            <Link href={withNext("/signin", next)} className={`mt-6 inline-block ${linkClass}`}>
              Go to sign in
            </Link>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {guest && (
        <AuthNote>
          You&apos;re using Majnu as a guest. Create your account here and everything you made comes with you.
        </AuthNote>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {googleAnyway ? (
        <GoogleAnyway onClick={() => handleGoogleSignUp(true)} loading={isGoogleLoading} disabled={busy} />
      ) : (
        <GoogleButton onClick={() => handleGoogleSignUp()} loading={isGoogleLoading} disabled={busy} />
      )}
      <OrDivider />

      <form onSubmit={handleSubmit(handleEmailSignUp)} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClass}>Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" disabled={busy} className={inputClass} {...register("email")} />
          {errors.email && <p className="text-sm text-[#F2A7A7]">{errors.email.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="password" className={labelClass}>Password</Label>
          <Input id="password" type="password" autoComplete="new-password" disabled={busy} className={inputClass} {...register("password")} />
          {errors.password ? (
            <p className="text-sm text-[#F2A7A7]">{errors.password.message}</p>
          ) : (
            <p className="text-sm text-night-lilac/80">At least 6 characters.</p>
          )}
        </div>
        {/* Cloudflare Turnstile, invisible: nothing shows here, and it takes no room. */}
        <div ref={turnstile.containerRef} className="!mt-0" />
        <Button type="submit" className={submitClass} disabled={busy}>
          {isEmailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-night-lilac">
        Already have an account?{" "}
        <Link href={withNext("/signin", next)} className={linkClass}>
          Sign in
        </Link>
      </p>
    </div>
  )
}
