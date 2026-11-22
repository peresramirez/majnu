"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { signInWithGoogle } from "@/app/auth/actions"
import { afterAuthPath } from "@/app/auth/destination"
import { nextPathFromSearch, withNext } from "@/lib/billing/next-path"
import { createClient } from "@/lib/supabase/client"
import { signInSchema } from "@/lib/validations"
import { authCallbackUrl } from "./callback-url"
import { AuthNote, GoogleAnyway, GoogleButton, OrDivider, inputClass, labelClass, submitClass } from "./auth-fields"
import { callbackErrorMessage, friendlyAuthError, offersGoogleAnyway } from "./auth-errors"
import { useAuth } from "./auth-provider"
import { sendSignInLink, signInWithEmail } from "./email-auth"
import { useTurnstile } from "./turnstile"

const linkClass = "rounded font-semibold text-night-petal underline-offset-4 hover:underline"

export default function SignInForm() {
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isLinkLoading, setIsLinkLoading] = useState(false)
  // The address a sign-in link was just sent to.
  const [linkSentTo, setLinkSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Set when linking Google to the guest account was refused: the guest may
  // still sign in to that Google account, leaving the guest account behind.
  const [googleAnyway, setGoogleAnyway] = useState(false)
  const router = useRouter()
  const busy = isEmailLoading || isGoogleLoading || isLinkLoading
  const guest = useAuth().user?.is_anonymous === true
  const turnstile = useTurnstile("signin")
  // Where to go after signing in: a same-site ?next=... (an old ?plan=full-moon
  // link from the retired subscription means Purchases), otherwise the gift
  // finder; and ?auth_error=... from the auth callback. Read after mount, so
  // the page stays static.
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
    trigger,
    getValues,
    clearErrors,
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
      router.push(afterAuthPath(next))
      router.refresh()
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign you in. Try again."))
    } finally {
      setIsEmailLoading(false)
    }
  }

  // "Email me a sign-in link": needs only the email field, not the password.
  const handleSendLink = async () => {
    setError(null)
    setGoogleAnyway(false)
    setLinkSentTo(null)
    clearErrors("password")
    if (!(await trigger("email"))) return
    const email = getValues("email").trim()
    setIsLinkLoading(true)
    try {
      const captchaToken = await turnstile.getToken()
      const redirectTo = authCallbackUrl(process.env.NEXT_PUBLIC_SITE_URL || window.location.origin, next)
      const result = await sendSignInLink(createClient().auth, { email, captchaToken, redirectTo })
      turnstile.reset()
      if (!result.ok) {
        setError(friendlyAuthError(result.error, "We couldn't send a sign-in link. Try again."))
        return
      }
      setLinkSentTo(email)
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't send a sign-in link. Try again."))
    } finally {
      setIsLinkLoading(false)
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

      {linkSentTo && (
        <div role="status">
          <AuthNote>
            If there&apos;s a Majnu account for <strong className="font-semibold text-night-petal">{linkSentTo}</strong>, a sign-in link
            is on its way. Open it on this device or any other; it works once and expires in an hour.
          </AuthNote>
        </div>
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
          <div className="flex items-baseline justify-between gap-4">
            <Label htmlFor="password" className={labelClass}>Password</Label>
            <Link href="/forgot-password" className="rounded text-sm text-night-lilac underline-offset-4 hover:text-night-petal hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose">
              Forgot your password?
            </Link>
          </div>
          <Input id="password" type="password" autoComplete="current-password" disabled={busy} className={inputClass} {...register("password")} />
          {errors.password && <p className="text-sm text-[#F2A7A7]">{errors.password.message}</p>}
        </div>
        {/* Cloudflare Turnstile, invisible: nothing shows here, and it takes no room. */}
        <div ref={turnstile.containerRef} className="!mt-0" />
        <Button type="submit" className={submitClass} disabled={busy}>
          {isEmailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Sign in
        </Button>
        <button
          type="button"
          onClick={handleSendLink}
          disabled={busy}
          className="!mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-semibold text-night-petal ring-1 ring-inset ring-night-petal/25 transition-colors duration-200 ease-calm hover:bg-night-velvet disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-night-rose"
        >
          {isLinkLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Mail className="h-4 w-4" aria-hidden="true" />}
          Email me a sign-in link
        </button>
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
