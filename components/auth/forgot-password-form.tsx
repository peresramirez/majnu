"use client"

import { useState } from "react"
import Link from "next/link"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { AlertCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { createClient } from "@/lib/supabase/client"
import { signInSchema } from "@/lib/validations"
import { AuthNote, inputClass, labelClass, submitClass } from "./auth-fields"
import { friendlyAuthError } from "./auth-errors"
import { authCallbackUrl } from "./callback-url"
import { sendPasswordReset } from "./email-auth"
import { useTurnstile } from "./turnstile"

const schema = signInSchema.pick({ email: true })
const linkClass = "rounded font-semibold text-night-petal underline-offset-4 hover:underline"

// "Forgot your password?": sends a reset link. The link (lib/email/auth-emails.ts)
// goes through /auth/confirm, which signs the browser in and opens /reset-password.
export default function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const turnstile = useTurnstile("reset")
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: "" } })

  const onSubmit = async ({ email }: z.infer<typeof schema>) => {
    setError(null)
    setLoading(true)
    try {
      const captchaToken = await turnstile.getToken()
      const redirectTo = authCallbackUrl(process.env.NEXT_PUBLIC_SITE_URL || window.location.origin, "/reset-password")
      const result = await sendPasswordReset(createClient().auth, { email, captchaToken, redirectTo })
      turnstile.reset()
      if (!result.ok) {
        setError(friendlyAuthError(result.error, "We couldn't send the link. Try again."))
        return
      }
      setSentTo(email)
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't send the link. Try again."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {sentTo && (
        <div role="status">
          <AuthNote>
            If there&apos;s a Majnu account for <strong className="font-semibold text-night-petal">{sentTo}</strong>, a link to choose
            a new password is on its way. It works once and expires in an hour.
          </AuthNote>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email" className={labelClass}>Email</Label>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" disabled={loading} className={inputClass} {...register("email")} />
          {errors.email && <p className="text-sm text-[#F2A7A7]">{errors.email.message}</p>}
        </div>
        <div ref={turnstile.containerRef} className="!mt-0" />
        <Button type="submit" className={submitClass} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {sentTo ? "Send it again" : "Email me a reset link"}
        </Button>
      </form>

      <p className="text-center text-sm text-night-lilac">
        Remembered it?{" "}
        <Link href="/signin" className={linkClass}>
          Sign in
        </Link>
      </p>
    </div>
  )
}
