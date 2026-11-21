// The words of a letter: paragraphs and the sign-off. Shared by every letter
// template so a message reads the same way whichever one the sender chose.
import type { CSSProperties } from "react"
import { bodyStyle, signOffStyle } from "./chrome"
import { signOffLines } from "./names"

export function Paragraphs({
  body,
  className = "",
  stagger = false,
  style,
}: {
  body: string[]
  className?: string
  // Fade the paragraphs in one after another (the template defines `.rise`).
  stagger?: boolean
  style?: CSSProperties
}) {
  return (
    <div className={`space-y-[0.9em] ${className}`} style={{ ...bodyStyle, ...style }}>
      {(body ?? []).map((p, i) => (
        <p key={i} className={stagger ? "rise" : undefined} style={stagger ? { animationDelay: `${300 + i * 110}ms` } : undefined}>
          {p}
        </p>
      ))}
    </div>
  )
}

export function SignOff({
  signOff,
  senderName,
  className = "",
  align = "left",
}: {
  signOff: string
  senderName: string
  className?: string
  align?: "left" | "center"
}) {
  const { line, name } = signOffLines(signOff, senderName)
  return (
    <div className={`${align === "center" ? "text-center" : ""} ${className}`}>
      {line ? (
        <p className="text-[24px] leading-tight" style={signOffStyle}>
          {line}
        </p>
      ) : null}
      {name ? (
        <p className="mt-1 text-[34px] leading-tight" style={{ ...signOffStyle, fontStyle: "normal" }}>
          {name}
        </p>
      ) : null}
    </div>
  )
}
