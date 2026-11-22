import { qrMatrix, qrPath } from "@/components/share/qr"

// A QR code drawn as SVG on the server, with the four-module quiet zone
// scanners expect. Dark modules in plum on petal white: the highest contrast
// in the palette, so phones read it from the back of a room.
export function QrCode({ text, label, className = "" }: { text: string; label: string; className?: string }) {
  const matrix = qrMatrix(text)
  const margin = 4
  const size = matrix.length + margin * 2
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#F5EAF1" />
      <path d={qrPath(matrix, margin)} fill="#1B1226" />
    </svg>
  )
}
