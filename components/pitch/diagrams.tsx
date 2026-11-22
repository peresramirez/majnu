// The deck's two diagrams, drawn as SVG on the server. Only what the code does:
// docs/architecture.md, docs/features/gift-finder-api.md, social-profiles.md,
// sharing-and-tracking.md, billing.md and daytona-redesign.md describe each
// box. Text sizes are in canvas pixels of the 1920 × 1080 slide, so the
// slide-six labels (28 to 38) still read from the back of a room.
import "server-only"
import type { CSSProperties } from "react"

type Scale = { title: number; sub: number; gap: number }
const BIG: Scale = { title: 36, sub: 28, gap: 40 }
const SMALL: Scale = { title: 27, sub: 21, gap: 29 }

const fade = (i: number) => ({ "--i": i }) as CSSProperties

// A box with a title and lines under it, centred both ways.
function Box({
  x,
  y,
  w,
  h,
  title,
  lines = [],
  scale,
  dashed = false,
  code = false,
  i,
}: {
  x: number
  y: number
  w: number
  h: number
  title: string
  lines?: string[]
  scale: Scale
  dashed?: boolean
  code?: boolean
  i: number
}) {
  const block = scale.title + lines.length * scale.gap
  const top = y + (h - block) / 2 + scale.title * 0.8
  return (
    <g className="pd-in pd-in--fade" style={fade(i)}>
      <rect x={x} y={y} width={w} height={h} rx={scale === BIG ? 28 : 20} className={dashed ? "dg-box dg-box--dashed" : "dg-box"} />
      <text x={x + w / 2} y={top} textAnchor="middle" className={code ? "dg-title dg-code" : "dg-title"} fontSize={scale.title}>
        {title}
      </text>
      {lines.map((line, n) => (
        <text key={line} x={x + w / 2} y={top + (n + 1) * scale.gap} textAnchor="middle" className="dg-sub" fontSize={scale.sub}>
          {line}
        </text>
      ))}
    </g>
  )
}

function Arrow({ d, marker, i, dashed = false }: { d: string; marker: string; i: number; dashed?: boolean }) {
  return (
    <path
      d={d}
      className={dashed ? "dg-line dg-line--dashed pd-in pd-in--fade" : "dg-line pd-in pd-in--fade"}
      style={fade(i)}
      markerEnd={`url(#${marker})`}
    />
  )
}

function ArrowHead({ id }: { id: string }) {
  return (
    <marker id={id} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0 0L10 5L0 10z" fill="#EAB394" />
    </marker>
  )
}

// Slide six: the phone, Majnu's agents, the gift page and its tracking, with
// payments and the personalised wrapper underneath.
export function SystemDiagram() {
  const m = "pd-arrow-system"
  return (
    <svg viewBox="0 30 1600 640" className="pd-diagram" preserveAspectRatio="xMinYMid meet" role="img" aria-labelledby="pd-system-title">
      <title id="pd-system-title">
        Your phone talks to Majnu&apos;s agents on Claude, which research the web and public profiles, recommend three gifts and
        write the gift page. The page&apos;s link is sent, and its opens are tracked. Payments go through Stripe Checkout, and
        the personalised wrapper is designed by Claude Code in a Daytona sandbox.
      </title>
      <defs>
        <ArrowHead id={m} />
      </defs>

      <g className="pd-in pd-in--fade" style={fade(1)}>
        <rect x={0} y={130} width={290} height={200} rx={28} className="dg-box" />
        <rect x={123} y={160} width={44} height={70} rx={10} className="dg-icon" />
        <line x1={138} y1={218} x2={152} y2={218} className="dg-icon" />
        <text x={145} y={272} textAnchor="middle" className="dg-title" fontSize={BIG.title}>
          Your phone
        </text>
        <text x={145} y={306} textAnchor="middle" className="dg-sub" fontSize={25}>
          words, voice, a profile
        </text>
      </g>
      <Arrow d="M296 230H352" marker={m} i={2} />

      <g className="pd-in pd-in--fade" style={fade(3)}>
        <rect x={360} y={40} width={560} height={380} rx={28} className="dg-box dg-box--lit" />
        <text x={408} y={112} className="dg-title" fontSize={38}>
          Majnu’s agents on Claude
        </text>
        {["Research the web", "Read public profiles", "Recommend three gifts", "Write the page"].map((line, n) => (
          <g key={line}>
            <circle cx={420} cy={180 + n * 62} r={8} className="dg-dot" style={{ opacity: 0.4 + n * 0.2 }} />
            <text x={448} y={191 + n * 62} className="dg-text" fontSize={32}>
              {line}
            </text>
          </g>
        ))}
      </g>
      <Arrow d="M926 230H982" marker={m} i={4} />

      <Box x={990} y={130} w={280} h={200} title="The gift page" lines={["and its link"]} scale={BIG} i={5} />
      <Arrow d="M1276 230H1332" marker={m} i={6} />
      <Box x={1340} y={130} w={260} h={200} title="Opened" lines={["and tracked"]} scale={BIG} i={7} />

      <Box x={360} y={520} w={300} h={140} title="Payments" lines={["Stripe Checkout"]} scale={BIG} dashed i={8} />
      <Arrow d="M666 590H722" marker={m} i={9} />
      <Box
        x={730}
        y={520}
        w={540}
        h={140}
        title="Personalised wrapper"
        lines={["Claude Code in a Daytona sandbox"]}
        scale={BIG}
        dashed
        i={10}
      />
      <Arrow d="M1130 514V338" marker={m} i={11} dashed />
    </svg>
  )
}

// The appendix: the finder's tool loop, wrapping, and where the data goes.
export function AgentsDiagram() {
  const m = "pd-arrow-agents"
  return (
    <svg viewBox="0 0 1600 800" className="pd-diagram" preserveAspectRatio="xMinYMid meet" role="img" aria-labelledby="pd-agents-title">
      <title id="pd-agents-title">
        The finder agent on Claude has three tools: read_profile reads Instagram or TikTok through Apify, or another public
        page through Tavily Extract, into three to six interests; ask_questions asks up to three questions with answers to
        tap; find_gifts hands who the gift is for, age, budget and interests to a research sub-agent, which searches the web
        with Tavily in the visitor&apos;s language and country and returns three gifts, one recommended. The chosen gift is
        wrapped by the builder sub-agent, whose structured output is checked against the letter schema, into a template,
        and published as a gift page at /l/ and its slug. Data lives in Supabase Postgres behind row-level security; opens
        are recorded by a beacon with a hashed visitor id in letter_events; a paid wrapper goes from Stripe through a
        webhook and a Cloudflare Queue to a Daytona sandbox where Claude Code writes the page, stored in letter_designs.
      </title>
      <defs>
        <ArrowHead id={m} />
      </defs>

      <text x={0} y={22} className="dg-label">
        FINDING A GIFT
      </text>
      <Box x={0} y={150} w={280} h={210} title="Finder agent" lines={["Claude, streamed", "three tools"]} scale={SMALL} i={1} />
      <Arrow d="M286 230C320 230 320 115 352 115" marker={m} i={2} />
      <Arrow d="M286 255H352" marker={m} i={2} />
      <Arrow d="M286 280C320 280 320 395 352 395" marker={m} i={2} />
      <Box
        x={360}
        y={60}
        w={460}
        h={110}
        title="read_profile"
        lines={["Instagram, TikTok or a public page", "→ 3 to 6 interests"]}
        scale={SMALL}
        code
        i={3}
      />
      <Box x={360} y={200} w={460} h={110} title="ask_questions" lines={["Up to 3 questions, answers to tap"]} scale={SMALL} code i={4} />
      <Box x={360} y={340} w={460} h={110} title="find_gifts" lines={["Who it is for, age, budget, interests"]} scale={SMALL} code i={5} />
      <Arrow d="M826 395H892" marker={m} i={6} />
      <Box
        x={900}
        y={320}
        w={330}
        h={150}
        title="Research sub-agent"
        lines={["Claude + web search (Tavily)", "their language and country"]}
        scale={SMALL}
        i={7}
      />
      <Arrow d="M1236 395H1302" marker={m} i={8} />
      <Box x={1310} y={320} w={290} h={150} title="Three gifts" lines={["real shops, local prices", "one recommended, and why"]} scale={SMALL} i={9} />

      <text x={0} y={490} className="dg-label">
        WRAPPING AND SENDING
      </text>
      <Arrow d="M1455 476V508H150V532" marker={m} i={10} />
      <Box x={0} y={540} w={300} h={120} title="Chosen gift" lines={["POST /api/finder/wrap"]} scale={SMALL} i={11} />
      <Arrow d="M306 600H372" marker={m} i={12} />
      <Box
        x={380}
        y={540}
        w={420}
        h={120}
        title="Builder sub-agent"
        lines={["Claude, structured output", "checked against the letter schema"]}
        scale={SMALL}
        i={13}
      />
      <Arrow d="M806 600H852" marker={m} i={14} />
      <Box x={860} y={540} w={330} h={120} title="Template" lines={["gift reveal, 3D box, envelope…"]} scale={SMALL} i={15} />
      <Arrow d="M1196 600H1262" marker={m} i={16} />
      <Box x={1270} y={540} w={330} h={120} title="Gift page /l/slug" lines={["no account, no cookies"]} scale={SMALL} i={17} />

      <Box
        x={0}
        y={690}
        w={500}
        h={110}
        title="Supabase Postgres"
        lines={["row-level security on every table"]}
        scale={SMALL}
        dashed
        i={18}
      />
      <Box
        x={540}
        y={690}
        w={500}
        h={110}
        title="Open tracking"
        lines={["beacon → hashed visitor → letter_events"]}
        scale={SMALL}
        dashed
        i={19}
      />
      <Box
        x={1080}
        y={690}
        w={520}
        h={110}
        title="Personalised wrapper"
        lines={["Stripe → webhook → Cloudflare Queue", "→ Claude Code in Daytona → letter_designs"]}
        scale={SMALL}
        dashed
        i={20}
      />
    </svg>
  )
}
