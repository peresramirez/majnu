// three.js is about 700 KB. The rule (issue #40): only the 3D box template may
// load it, and only on demand, so no other gift page ships it. This test reads
// the source: the scene module is the only file that imports "three", and the
// template reaches the scene only through import() or a type-only import.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()
const SCENE = "components/letters/templates/gift-box-3d/scene.ts"

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : sources(path)
    return /\.(ts|tsx|mts)$/.test(name) ? [path] : []
  })
}

const files = ["app", "components", "lib"].flatMap((d) => sources(join(root, d))).map((p) => relative(root, p))

// Every static import in a file, as written: `import x from "y"`, `import { a,
// b } from "y"` across lines, and `import "y"`. Type-only imports are erased at
// build time, so they are left out.
function runtimeImports(file: string): string[] {
  const src = readFileSync(join(root, file), "utf8")
  const withFrom = [...src.matchAll(/^\s*import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gm)]
    .filter((m) => !/^type\b/.test(m[1].trim()))
    .map((m) => m[2])
  const bare = [...src.matchAll(/^\s*import\s+["']([^"']+)["']/gm)].map((m) => m[1])
  return [...withFrom, ...bare]
}

describe("three.js loads on demand", () => {
  it("is imported by the scene module and nothing else", () => {
    const importers = files.filter((f) => runtimeImports(f).some((m) => m === "three" || m.startsWith("three/")))
    expect(importers).toEqual([SCENE])
  })

  it("reaches the template only through import() or a type-only import", () => {
    const importers = files.filter((f) => runtimeImports(f).some((m) => m.endsWith("gift-box-3d/scene")))
    expect(importers).toEqual([])
    const template = readFileSync(join(root, "components/letters/templates/gift-box-3d.tsx"), "utf8")
    expect(template).toMatch(/import\(["']\.\/gift-box-3d\/scene["']\)/)
  })
})
