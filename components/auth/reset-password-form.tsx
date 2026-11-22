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
import { APP_HOME } from "@/components/app/tabs"
import { createClient } from "@/lib/supabase/client"
import { signUpSchema } from "@/lib/validations"
import { AuthNote, inputClass, labelClass, submitClass } from "./auth-fields"
import { friendlyAuthError } from "./auth-errors"
import { useAuth } from "./auth-provider"

const schema = signUpSchema
  .pick({ password: true })
  .extend({ confirm: z.string() })
  .refine((values) => values.password === values.confirm, { message: "The two passwords don't match.", path: ["confirm"] })

const linkClass = "rounded font-semibold text-night-petal underline-offset-4 hover:underline"

const resetErrors: Record<string, string> = {
  same_password: "That's your current password. Choose a different one.",
  weak_password: "Choose a longer password, with letters and numbers.",
  session_not_found: "This reset link has expired. Ask for a new one.",
}

// After a password-reset link: the browser is signed in (/auth/confirm did
// that), so updateUser sets the new password on this account.
export default function ResetPasswordForm() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } })

  const signedIn = Boolean(user && !user.is_anonymous)

  const onSubmit = async ({ password }: z.infer<typeof schema>) => {
    setError(null)
    setLoading(true)
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password })
      if (updateError) {
        const known = updateError.code ? resetErrors[updateError.code] : undefined
        setError(known ?? friendlyAuthError(updateError, "We couldn't change your password. Try again."))
        return
      }
      router.push(APP_HOME)
      router.refresh()
    } catch (err) {
      setError(friendlyAuthError(err, "We couldn't change your password. Try again."))
    } finally {
      setLoading(false)
    }
  }

  if (!isLoading && !signedIn) {
    return (
      <div className="space-y-6">
        <AuthNote>
          Open the link in your password-reset email to choose a new password here. If it has expired,{" "}
          <Link href="/forgot-password" className={linkClass}>
            ask for a new one
          </Link>
          .
        </AuthNote>
        <p className="text-center text-sm text-night-lilac">
          <Link href="/signin" className={linkClass}>
            Back to sign in
          </Link>
        </p>
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

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {user?.email && (
          // Lets password managers save the new password against the right account.
          <input type="email" name="email" autoComplete="username" value={user.email} readOnly hidden />
        )}
        <div className="space-y-2">
          <Label htmlFor="password" className={labelClass}>New password</Label>
          <Input id="password" type="password" autoComplete="new-password" disabled={loading || isLoading} className={inputClass} {...register("password")} />
          {errors.password && <p className="text-sm text-[#F2A7A7]">{errors.password.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm" className={labelClass}>Type it again</Label>
          <Input id="confirm" type="password" autoComplete="new-password" disabled={loading || isLoading} className={inputClass} {...register("confirm")} />
          {errors.confirm && <p className="text-sm text-[#F2A7A7]">{errors.confirm.message}</p>}
        </div>
        <Button type="submit" className={submitClass} disabled={loading || isLoading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Save new password
        </Button>
      </form>
    </div>
  )
}
