import { z } from "zod"

const email = z.string().trim().email("Enter an email address, like you@example.com.")

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
})

export const signUpSchema = z.object({
  email,
  password: z.string().min(6, "Use at least 6 characters."),
})
