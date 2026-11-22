// The envelope itself, drawn for next/og (satori): every element with more
// than one child is an explicit flex box, and only inline styles are used. It
// takes a kind ("A gift") and a first name and nothing else; og-envelope.ts
// decides both.
import { nameFontSize } from "./og-envelope"

const PLUM = "#1B1226"
const INK = "#2A1C3A"
const MUTED = "#6E5A78"
const ROSE_GOLD = "#EAB394"
const LILAC = "#BCA8C4"

const STARS: [number, number, number][] = [
  // Kept clear of the label above the envelope (x 380 to 820).
  [70, 60, 2], [190, 130, 1.5], [330, 42, 1.5], [520, 90, 2], [880, 38, 1.5], [960, 112, 2], [1110, 70, 1.5],
  [60, 300, 1.5], [1140, 260, 2], [120, 520, 2], [250, 590, 1.5], [1000, 560, 1.5], [1150, 470, 1.5], [880, 600, 2],
]

// The brand crescent (public/brand/majnu-mark.svg), in plum, pressed into the seal.
const CRESCENT = "M27.84 10.4A22 22 0 1 0 52.86 38.98A19 19 0 1 1 27.84 10.4Z"

export function EnvelopeImage({ name, kind }: { name: string; kind: string }) {
  const W = 680
  const H = 425
  // The flap's tip, where the seal sits; the name goes on the pocket below it.
  const TIP = H * 0.42
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        backgroundColor: PLUM,
        backgroundImage: "radial-gradient(120% 100% at 72% 30%, #3E2759 0%, #1B1226 58%, #100A17 100%)",
        fontFamily: "Gilda Display",
      }}
    >
      {STARS.map(([x, y, r], i) => (
        <div
          key={i}
          style={{
            position: "absolute",
            left: x,
            top: y,
            width: r * 2,
            height: r * 2,
            borderRadius: r,
            backgroundColor: "#F5EAF1",
            opacity: 0.25 + (i % 3) * 0.15,
          }}
        />
      ))}

      <div style={{ display: "flex", fontSize: 22, letterSpacing: 7, textTransform: "uppercase", color: LILAC }}>{kind}</div>

      <div style={{ display: "flex", position: "relative", width: W, height: H, marginTop: 30 }}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          <defs>
            <radialGradient id="wax" cx="36%" cy="30%" r="78%">
              <stop offset="0%" stopColor="#F6D3BF" />
              <stop offset="45%" stopColor={ROSE_GOLD} />
              <stop offset="100%" stopColor="#B9775A" />
            </radialGradient>
            <clipPath id="body">
              <rect x="0" y="0" width={W} height={H} rx="10" />
            </clipPath>
          </defs>
          {/* Body, side folds, front pocket, top flap, all inside the rounded body */}
          <g clipPath="url(#body)">
            <rect x="0" y="0" width={W} height={H} fill="#F7F0E6" />
            <path d={`M0 0 L${W / 2 - 20} ${H * 0.46} L0 ${H} Z`} fill="#F1E7D9" />
            <path d={`M${W} 0 L${W / 2 + 20} ${H * 0.46} L${W} ${H} Z`} fill="#F1E7D9" />
            <path d={`M0 ${H} L${W / 2} ${TIP - 8} L${W} ${H} Z`} fill="#EEE2D1" />
            <path d={`M0 0 L${W} 0 L${W / 2} ${TIP} Z`} fill="#E9DAC5" />
            <path d={`M0 0 L${W / 2} ${TIP} L${W} 0`} fill="none" stroke="#D9C6AC" strokeWidth="2" />
          </g>
          {/* Wax seal with the crescent */}
          <circle cx={W / 2} cy={TIP} r="46" fill="url(#wax)" />
          <circle cx={W / 2} cy={TIP} r="32" fill="none" stroke="rgba(0,0,0,0.16)" strokeWidth="2.4" />
          <g transform={`translate(${W / 2 - 21} ${TIP - 23}) scale(0.68)`}>
            <path d={CRESCENT} fill="#8A4F3A" />
          </g>
        </svg>

        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 30,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            color: INK,
          }}
        >
          <div style={{ display: "flex", fontSize: 20, letterSpacing: 8, textTransform: "uppercase", color: MUTED }}>For</div>
          <div style={{ display: "flex", fontSize: nameFontSize(name), lineHeight: 1.1, whiteSpace: "nowrap" }}>{name}</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", marginTop: 34, fontSize: 24, color: ROSE_GOLD, letterSpacing: 1 }}>majnu.app</div>
    </div>
  )
}
