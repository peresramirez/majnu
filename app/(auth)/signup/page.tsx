import type { Metadata } from "next"
import SignUpForm from "@/components/auth/sign-up-form"

export const metadata: Metadata = { title: "Create your account" }

export default function SignUpPage() {
  return (
    <>
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">Create your account</h1>
      <p className="mt-3 text-night-lilac">Free to start. Your first gift takes a few minutes.</p>
      <div className="mt-9">
        <SignUpForm />
      </div>
    </>
  )
}
