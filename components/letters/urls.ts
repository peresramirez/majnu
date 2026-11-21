// Only https links and images are shown on a letter; anything else (javascript:,
// data:, plain http) is dropped.
export function safeHttps(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    return u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}
