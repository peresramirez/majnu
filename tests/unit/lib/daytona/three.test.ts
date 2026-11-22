// The pinned three.js that custom designs import (lib/daytona/config.ts,
// scripts/daytona/vendor-three.mts). Stored designs import it by URL, so the
// file must stay exactly as published.
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { THREE_MODULE_PATH, THREE_MODULE_SHA256, THREE_VERSION } from "@/lib/daytona/config"

const file = readFileSync(`public${THREE_MODULE_PATH}`)

describe("the vendored three.js", () => {
  it("is the published file, unchanged", () => {
    expect(THREE_MODULE_PATH).toBe(`/vendor/three/${THREE_VERSION}/three.module.min.js`)
    expect(createHash("sha256").update(file).digest("hex")).toBe(THREE_MODULE_SHA256)
  })

  it("is one self-contained module of that version", () => {
    const text = file.toString("utf8")
    expect(text).toMatch(/^\/\*\*\s*\n\s*\* @license/)
    expect(text).toContain(`"${THREE_VERSION.split(".")[1]}"`)
    // Nothing for the browser to fetch next: no imports, no source map link.
    // (Its own warning text says "imported", so match statements, not the word.)
    expect(text).not.toMatch(/\bimport\s*["'{*(]|\bimport\s+[\w$]+\s*(?:,|from\b)|\bexport\s*\*|sourceMappingURL/)
    expect(text).toContain("WebGLRenderer")
  })

  it("is served with immutable caching and CORS for the sandboxed design", () => {
    const headers = readFileSync("public/_headers", "utf8")
    const rule = headers.slice(headers.indexOf("/vendor/three/*"))
    expect(rule).toMatch(/^\/vendor\/three\/\*\n  Cache-Control: public,max-age=31536000,immutable\n  Access-Control-Allow-Origin: \*\n/)
  })
})
