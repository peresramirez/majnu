import type { Metadata } from "next"
import ForgotPasswordForm from "@/components/auth/forgot-password-form"

export const metadata: Metadata = { title: "Forgot your password?" }

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">Forgot your password?</h1>
      <p className="mt-3 text-night-lilac">Enter your email and we&apos;ll send you a link to choose a new one.</p>
      <div className="mt-9">
        <ForgotPasswordForm />
      </div>
    </>
  )
}
