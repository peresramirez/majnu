// A moon phase icon. `lit` runs from 0 (new moon) to 1 (full moon).
export function MoonPhase({ lit, size = 28, className = "" }: { lit: number; size?: number; className?: string }) {
  const r = 12
  const c = 14
  const e = 1 - 2 * Math.min(1, Math.max(0, lit)) // terminator: 1 = new, 0 = half, -1 = full
  const litPath =
    lit <= 0
      ? ""
      : `M${c} ${c - r}A${r} ${r} 0 0 1 ${c} ${c + r}A${Math.abs(e) * r} ${r} 0 0 ${e > 0 ? 0 : 1} ${c} ${c - r}Z`
  return (
    <svg viewBox="0 0 28 28" width={size} height={size} className={className} aria-hidden="true">
      <circle cx={c} cy={c} r={r} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      {litPath && <path d={litPath} fill="currentColor" />}
    </svg>
  )
}
