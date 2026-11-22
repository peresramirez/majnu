import type { Metadata } from "next"
import ResetPasswordForm from "@/components/auth/reset-password-form"

export const metadata: Metadata = { title: "Choose a new password" }

export default function ResetPasswordPage() {
  return (
    <>
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">Choose a new password</h1>
      <p className="mt-3 text-night-lilac">Use at least 6 characters. You&apos;ll stay signed in on this device.</p>
      <div className="mt-9">
        <ResetPasswordForm />
      </div>
    </>
  )
}
