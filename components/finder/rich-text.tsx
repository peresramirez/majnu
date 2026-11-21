import { Fragment, type ReactNode } from "react"

// Majnu's replies are plain text with paragraphs and **bold** only, so that is
// all this renders. Everything else stays literal text; nothing is parsed as HTML.
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${key}-${i}`} className="font-semibold text-night-petal">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <Fragment key={`${key}-${i}`}>{part}</Fragment>
    ),
  )
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim() !== "")
  return (
    <div className={`space-y-3 ${className}`}>
      {paragraphs.map((p, i) => (
        <p key={i}>
          {p.split("\n").map((line, j) => (
            <Fragment key={j}>
              {j > 0 && <br />}
              {inline(line, `${i}-${j}`)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  )
}
