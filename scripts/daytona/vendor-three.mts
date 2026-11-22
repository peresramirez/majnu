// Writes the one copy of three.js that custom designs may import
// (docs/features/daytona-redesign.md, "3D"):
//
//   node scripts/daytona/vendor-three.mts
//
// three ships `build/three.module.js`, which imports `./three.core.js`, and no
// minified build. A design may load exactly one script file, so this bundles
// the two into one minified ES module at public/vendor/three/<version>/
// three.module.min.js and prints its sha-256. The version is the one installed
// from npm. After running it, set THREE_VERSION and THREE_MODULE_SHA256 in
// lib/daytona/config.ts, update the skill (daytona/sandbox/.claude/skills/
// majnu-letter/3d.md) if the API changed, and build a new snapshot. Never
// overwrite a published version: designs already stored import it by URL.
import { createHash } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"

process.chdir(fileURLToPath(new URL("../../", import.meta.url)))
const version = (JSON.parse(readFileSync("node_modules/three/package.json", "utf8")) as { version: string }).version
const outfile = `public/vendor/three/${version}/three.module.min.js`
if (existsSync(outfile) && !process.argv.includes("--force")) {
  console.error(`${outfile} exists. Published versions are immutable; pass --force only if it was never deployed.`)
  process.exit(1)
}

await build({
  entryPoints: ["node_modules/three/build/three.module.js"],
  outfile,
  bundle: true,
  format: "esm",
  minify: true,
  target: "es2020",
  // The MIT licence header stays at the top of the file.
  legalComments: "inline",
  logLevel: "warning",
})

const sha256 = createHash("sha256").update(readFileSync(outfile)).digest("hex")
console.log(`${outfile}\nthree ${version}, ${Math.round(readFileSync(outfile).length / 1024)} KB, sha-256 ${sha256}`)
