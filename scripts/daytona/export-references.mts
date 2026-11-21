// Saves one rendered example per template into the sandbox reference folder
// (daytona/sandbox/reference/rendered/), for Claude Code to read when it makes
// a custom design. Run it with the dev server up, before building a snapshot:
//
//   npx next dev -p 3103
//   node scripts/daytona/export-references.mts [http://localhost:3103]
//
// Each page is /dev/templates/<id>, which renders the template from its
// fixture. Scripts, stylesheets and comments are removed: what is left is the
// markup the server sends before any tap, with Tailwind class names and the
// palette's CSS variables in `style` attributes.
import { mkdir, writeFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { TEMPLATE_IDS } from "../../lib/letters/schema.ts"

const base = (process.argv[2] ?? "http://localhost:3103").replace(/\/$/, "")
const outDir = fileURLToPath(new URL("../../daytona/sandbox/reference/rendered/", import.meta.url))

function strip(html: string): string {
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html
  return body
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace(/<template\b[\s\S]*?<\/template>/gi, "")
    .replace(/<next-route-announcer\b[\s\S]*?<\/next-route-announcer>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\n\s*\n/g, "\n")
    .trim()
}

await mkdir(outDir, { recursive: true })
for (const id of TEMPLATE_IDS) {
  const res = await fetch(`${base}/dev/templates/${id}`)
  if (!res.ok) throw new Error(`${id}: ${res.status} from ${base}`)
  const markup = strip(await res.text())
  const page = [
    "<!doctype html>",
    `<!-- Reference only: the "${id}" template rendered from its fixture (reference/lib/letters/fixtures.ts),`,
    "     as the server sends it before any tap. Scripts and stylesheets were removed; the look comes from",
    "     Tailwind classes and the CSS variables in style attributes (reference/components/letters/theme.ts). -->",
    `<html lang="en"><head><meta charset="utf-8"><title>${id}</title></head>`,
    `<body>${markup}</body></html>`,
    "",
  ].join("\n")
  await writeFile(`${outDir}${id}.html`, page)
  console.log(`${id}: ${(Buffer.byteLength(page) / 1024).toFixed(1)} KB`)
}
