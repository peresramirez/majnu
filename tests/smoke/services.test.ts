// Checks that every key in .env.local reaches its service. Read-only: no model
// tokens are spent, no charges are created, no rows are written.
// Run with: npm run test:smoke
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@supabase/supabase-js"
import Stripe from "stripe"
import { describe, expect, it } from "vitest"

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set. Locally: add it to .env.local. In CI: run "npm run ci:secrets".`)
  }
  return value
}

describe("Supabase", () => {
  it("URL and anon key reach the auth service, and Google sign-in is on", async () => {
    const res = await fetch(`${required("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/settings`, {
      headers: { apikey: required("NEXT_PUBLIC_SUPABASE_ANON_KEY") },
    })
    expect(res.status).toBe(200)
    const settings = await res.json()
    expect(settings.external?.google).toBe(true)
  })

  it("service-role key can call the admin API", async () => {
    const admin = createClient(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    expect(error).toBeNull()
  })
})

describe("Anthropic", () => {
  it("API key works and the configured model is available", async () => {
    const client = new Anthropic({ apiKey: required("ANTHROPIC_API_KEY") })
    const wanted = process.env.MAJNU_MODEL || "claude-opus-5-5"
    const model = await client.models.retrieve(wanted)
    expect(model.id).toBe(wanted)
  })
})

const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

describe.skipIf(!stripeConfigured)("Stripe (skipped until a key is set)", () => {
  it("secret key works", async () => {
    const stripe = new Stripe(required("STRIPE_SECRET_KEY"))
    const balance = await stripe.balance.retrieve()
    expect(balance.object).toBe("balance")
    console.info(`Stripe is in ${balance.livemode ? "LIVE" : "test"} mode`)
  })

  it("publishable key is in the same mode as the secret key", () => {
    const mode = (key: string) => (key.includes("_live_") ? "live" : "test")
    expect(mode(required("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"))).toBe(mode(required("STRIPE_SECRET_KEY")))
  })
})

describe.skipIf(!process.env.BFL_API_KEY)("Black Forest Labs (optional, development only)", () => {
  it("API key is accepted", async () => {
    const res = await fetch("https://api.bfl.ai/v1/credits", {
      headers: { "x-key": process.env.BFL_API_KEY as string },
    })
    expect(res.status).toBe(200)
  })
})

describe.skipIf(!process.env.DAYTONA_API_KEY)("Daytona (optional extra)", () => {
  it("API key is accepted", async () => {
    const res = await fetch("https://app.daytona.io/api/api-keys/current", {
      headers: { Authorization: `Bearer ${process.env.DAYTONA_API_KEY}` },
    })
    expect(res.status).toBe(200)
  })
})
