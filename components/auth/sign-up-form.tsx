"use client"

import { useState } from "react"
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
import { signUp, signInWithGoogle } from "@/app/auth/actions"
import { signUpSchema } from "@/lib/validations"
import { GoogleButton, OrDivider, friendlyAuthError, inputClass, labelClass, submitClass } from "./auth-fields"

export default function SignUpForm() {
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmEmail, setConfirmEmail] = useState<string | null>(null)
  const router = useRouter()
  const busy = isEmailLoading || isGoogleLoading

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
    setIsEmailLoading(true)
    try {
      const { data, error } = await signUp(values.email, values.password)
      if (error) throw error
      // With email confirmation on, there is no session until the link is opened.
      if (!data?.session) {
        setConfirmEmail(values.email)
        return
      }
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't create your account. Try again."))
    } finally {
      setIsEmailLoading(false)
    }
  }

  const handleGoogleSignUp = async () => {
    setIsGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't reach Google. Try again."))
      setIsGoogleLoading(false)
    }
  }

  if (confirmEmail) {
    return (
      <div className="rounded-3xl bg-night-velvet p-7 ring-1 ring-inset ring-night-petal/10" role="status">
        <MailCheck className="h-7 w-7 text-night-rose" aria-hidden="true" />
        <h2 className="mt-4 font-display text-2xl">Check your email</h2>
        <p className="mt-2 leading-relaxed text-night-lilac">
          We sent a link to <span className="text-night-petal">{confirmEmail}</span>. Open it to confirm your account, then sign in.
        </p>
        <Link href="/signin" className="mt-6 inline-block rounded font-semibold text-night-petal underline-offset-4 hover:underline">
          Go to sign in
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <GoogleButton onClick={handleGoogleSignUp} loading={isGoogleLoading} disabled={busy} />
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
        <Button type="submit" className={submitClass} disabled={busy}>
          {isEmailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-night-lilac">
        Already have an account?{" "}
        <Link href="/signin" className="rounded font-semibold text-night-petal underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  )
}
