// The logo is a drawn file; never retype it in a font (docs/brand.md).
const files = {
  dark: "/brand/majnu-wordmark-on-dark.svg",
  light: "/brand/majnu-wordmark-on-light.svg",
}

// Aspect ratio of the wordmark artwork (viewBox 450 x 119).
const RATIO = 450 / 119

export function Wordmark({
  on = "dark",
  width = 140,
  className = "",
}: {
  on?: "dark" | "light"
  width?: number
  className?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={files[on]}
      alt="Majnu"
      width={width}
      height={Math.round(width / RATIO)}
      className={className}
    />
  )
}
