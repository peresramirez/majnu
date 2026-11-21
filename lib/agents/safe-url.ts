// Links written by a model end up as href and src attributes in templates and
// gift cards. Anything other than https (javascript:, data:, http:) is dropped.
export function httpsOnly(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).protocol === "https:" ? url : undefined
  } catch {
    return undefined
  }
}
