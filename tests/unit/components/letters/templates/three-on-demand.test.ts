// three.js is about 700 KB. The rule (issues #40 and #52): only the 3D
// templates may load it, and only on demand, so no other gift page ships it.
// This test reads the source: each 3D template's scene module is the only file
// that imports "three", and the scene is reached only through import() or a
// type-only import, from that template's client component alone.
import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, normalize, relative } from "node:path"
import { describe, expect, it } from "vitest"

const root = process.cwd()

// Each scene and the one client component that loads it with import().
const SCENES = [
  { scene: "components/letters/templates/gift-box-3d/scene.ts", loader: "components/letters/templates/gift-box-3d.tsx", specifier: "./gift-box-3d/scene" },
  { scene: "components/letters/templates/wedding-envelope-3d/scene.ts", loader: "components/letters/templates/wedding-envelope-3d/view.tsx", specifier: "./scene" },
  { scene: "components/letters/templates/wedding-invite-3d/scene.ts", loader: "components/letters/templates/wedding-invite-3d.tsx", specifier: "./wedding-invite-3d/scene" },
  { scene: "components/letters/templates/party-invite-3d/scene.ts", loader: "components/letters/templates/party-invite-3d.tsx", specifier: "./party-invite-3d/scene" },
  { scene: "components/letters/templates/gift-3d/scene.ts", loader: "components/letters/templates/gift-3d.tsx", specifier: "./gift-3d/scene" },
]

// The stage the issue #99 scenes share. It imports three.js too, so it may be
// imported only by those scenes, which are themselves reached only through import().
const STAGE = "components/letters/templates/three-kit/stage.ts"
const STAGE_USERS = SCENES.slice(2).map((s) => s.scene)

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

// A relative or "@/" specifier as a path from the repository root, without
// its extension, so "./scene" in one folder and "@/components/…/scene" match.
function resolveFrom(file: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) return normalize(specifier.slice(2))
  if (specifier.startsWith(".")) return normalize(join(dirname(file), specifier))
  return null
}

const withoutExtension = (path: string) => path.replace(/\.(ts|tsx|mts)$/, "")

describe("three.js loads on demand", () => {
  it("is imported by the scene modules and nothing else", () => {
    const importers = files.filter((f) => runtimeImports(f).some((m) => m === "three" || m.startsWith("three/")))
    expect(importers.sort()).toEqual([...SCENES.map((s) => s.scene), STAGE].sort())
  })

  it("lets only the issue #99 scenes import the shared stage", () => {
    const target = withoutExtension(STAGE)
    const importers = files.filter((f) => runtimeImports(f).some((m) => resolveFrom(f, m) === target))
    expect(importers.sort()).toEqual([...STAGE_USERS].sort())
  })

  it.each(SCENES)("reaches $scene only through import() or a type-only import", ({ scene, loader, specifier }) => {
    const target = withoutExtension(scene)
    const importers = files.filter((f) => runtimeImports(f).some((m) => resolveFrom(f, m) === target))
    expect(importers).toEqual([])
    const template = readFileSync(join(root, loader), "utf8")
    expect(template).toContain(`import("${specifier}")`)
  })

  it("keeps the wedding envelope's server half free of three.js and of the scene", () => {
    const src = readFileSync(join(root, "components/letters/templates/wedding-envelope-3d.tsx"), "utf8")
    expect(src).not.toMatch(/["']three["']/)
    expect(src).not.toMatch(/["'][^"']*\/scene["']/)
  })
})
