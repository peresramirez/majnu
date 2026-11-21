"use server"

import { redirect } from "next/navigation"
import { safeNextPath } from "@/lib/billing/next-path"
import { createClient } from "@/lib/supabase/server"


export async function signIn(email: string, password: string) {
  const supabase = await createClient()

  const data = {
    email: email,
    password: password,
  }

  return await supabase.auth.signInWithPassword(data)
}

export async function signUp(email: string, password: string) {
  const supabase = await createClient()

  const data = {
    email: email,
    password: password,
  }

  return await supabase.auth.signUp(data);
}

// `next` is where to land after Google sends the user back, for example the
// Plan tab for "Choose Full moon". It comes from the browser, so it is checked
// here (only same-site paths) and again in the callback.
export async function signInWithGoogle(next?: string | null) {
  const supabase = await createClient()

  const destination = safeNextPath(next)
  const callback = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: destination ? `${callback}?next=${encodeURIComponent(destination)}` : callback,
    },
  })

  if (error) {
    throw error
  }

  if (data?.url) {
    redirect(data.url)
  }

  return data
}


export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/signin")
}