// The queue consumer's environment (worker.ts).
//
// On Workers, `process.env` holds nothing by itself. For web requests,
// OpenNext's fetch handler fills it on every request: first the Worker's
// variables and secrets (strings in `env`), then the public values from
// .env.production that `opennextjs-cloudflare build` writes into
// .open-next/cloudflare/next-env.mjs. The queue handler never goes through
// OpenNext, so without this the design job found no Supabase URL or
// service-role key and every message failed (seen live on 22 November: no
// personalised wrapper could be made, paid or with a code).
//
// This does what OpenNext's populateProcessEnv does, minus the request-only
// parts: Worker values win, and the build's public values only fill gaps.

export type NextEnvModule = Partial<Record<string, Record<string, string>>>

export function populateQueueEnv(
  target: Record<string, string | undefined>,
  env: Record<string, unknown>,
  nextEnv: NextEnvModule,
): void {
  for (const [key, value] of Object.entries(env)) {
    if (typeof value === "string") target[key] = value
  }
  const mode = typeof env.NEXTJS_ENV === "string" ? env.NEXTJS_ENV : "production"
  const built = nextEnv[mode]
  if (!built) return
  for (const [key, value] of Object.entries(built)) {
    if (target[key] === undefined) target[key] = value
  }
}
