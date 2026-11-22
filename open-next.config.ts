import { defineCloudflareConfig } from "@opennextjs/cloudflare"
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache"

// Prerendered pages (landing, sign-in) are served from the build output
// instead of being rendered again on every request. Read-only: pages that
// need revalidation would need an R2 or KV cache instead.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
})
