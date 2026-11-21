import type { Metadata } from "next"
import SignInForm from "@/components/auth/sign-in-form"

export const metadata: Metadata = { title: "Sign in" }

export default function SignInPage() {
  return (
    <>
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">Welcome back</h1>
      <p className="mt-3 text-night-lilac">Sign in to create a gift or see who has opened yours.</p>
      <div className="mt-9">
        <SignInForm />
      </div>
    </>
  )
}
