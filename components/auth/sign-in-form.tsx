"use client"

import { useState } from "react"
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
import { signIn, signInWithGoogle } from "@/app/auth/actions"
import { signInSchema } from "@/lib/validations"
import { GoogleButton, OrDivider, friendlyAuthError, inputClass, labelClass, submitClass } from "./auth-fields"

export default function SignInForm() {
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const busy = isEmailLoading || isGoogleLoading

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
    setIsEmailLoading(true)
    try {
      const { error } = await signIn(values.email, values.password)
      if (error) throw error
      router.push("/dashboard")
      router.refresh()
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't sign you in. Try again."))
    } finally {
      setIsEmailLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogle()
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't reach Google. Try again."))
      setIsGoogleLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <GoogleButton onClick={handleGoogleSignIn} loading={isGoogleLoading} disabled={busy} />
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
        <Button type="submit" className={submitClass} disabled={busy}>
          {isEmailLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Sign in
        </Button>
      </form>

      <p className="text-center text-sm text-night-lilac">
        New to Majnu?{" "}
        <Link href="/signup" className="rounded font-semibold text-night-petal underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}
