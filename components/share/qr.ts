// QR codes for a letter's link, drawn as SVG (on screen and as a download)
// and as PNG (drawn on a canvas in the browser). The encoding comes from uqr,
// a small dependency-free encoder; everything else is ours.
import { encode } from "uqr"

// Rows of modules, true for dark. No quiet zone; callers add their own margin.
export function qrMatrix(text: string): boolean[][] {
  return encode(text, { ecc: "M", border: 0 }).data
}

// One SVG path for all dark modules, merging horizontal runs to keep it short.
export function qrPath(matrix: boolean[][], offset = 0): string {
  let d = ""
  matrix.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      if (!row[x]) {
        x++
        continue
      }
      let run = 1
      while (x + run < row.length && row[x + run]) run++
      d += `M${x + offset} ${y + offset}h${run}v1h-${run}z`
      x += run
    }
  })
  return d
}

export type QrColors = { fg: string; bg: string }

// A standalone SVG file with a four-module quiet zone, as scanners expect.
export function qrSvg(text: string, colors: QrColors = { fg: "#1B1226", bg: "#FFFFFF" }, margin = 4): string {
  const matrix = qrMatrix(text)
  const size = matrix.length + margin * 2
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * 16}" height="${size * 16}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="${colors.bg}"/>` +
    `<path d="${qrPath(matrix, margin)}" fill="${colors.fg}"/>` +
    `</svg>`
  )
}

// A PNG of the code, drawn module by module so the edges stay sharp.
export async function qrPng(text: string, colors: QrColors = { fg: "#1B1226", bg: "#FFFFFF" }, scale = 24, margin = 4): Promise<Blob | null> {
  const matrix = qrMatrix(text)
  const size = (matrix.length + margin * 2) * scale
  const canvas = document.createElement("canvas")
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.fillStyle = colors.bg
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = colors.fg
  matrix.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) ctx.fillRect((x + margin) * scale, (y + margin) * scale, scale, scale)
    }),
  )
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"))
}

export function downloadBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = href
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(href), 10_000)
}
