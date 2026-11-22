"use client"

// The Tracker's column charts (issue #75), drawn with Recharts through the
// shadcn wrapper in components/ui/chart.tsx. This module is the only one that
// imports Recharts, and time-charts.tsx loads it with next/dynamic, so the
// chart code ships only on the Tracker and only after the page has painted.
//
// One series, so one colour: rose gold bars on the velvet card (8.6:1), at
// most 24 px wide with 4 px rounded tops and a 2 px gap, on hairline grid
// lines. The values are also in each card's summary and hidden table, so the
// tooltip only adds to what is there.
import { useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart"
import { plural } from "../format"
import { countTicks } from "./analytics"
import { usePrefersReducedMotion } from "./use-reduced-motion"

export type ColumnDatum = { key: string; opens: number }

const config = { opens: { label: "Opens", color: "#EAB394" } } satisfies ChartConfig

const GRID = "rgba(245, 234, 241, 0.08)"
const BASELINE = "rgba(245, 234, 241, 0.2)"

// chart.tsx removes the outline from the chart's surface; keyboard users tab
// to it (arrow keys move the tooltip), so it gets the app's rose focus ring back.
const surfaceFocus =
  "[&_.recharts-surface:focus-visible]:outline [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-4 [&_.recharts-surface:focus-visible]:outline-night-rose [&_.recharts-surface]:rounded-md"

export function OpensColumnChart({
  data,
  ticks: labelled,
  tick,
  tooltipLabel,
  title,
  summary,
  className = "",
}: {
  data: ColumnDatum[]
  // The keys that get a label on the horizontal axis.
  ticks: string[]
  tick: (key: string) => string
  tooltipLabel: (key: string) => string
  title: string
  summary: string
  className?: string
}) {
  const reducedMotion = usePrefersReducedMotion()
  const ticks = countTicks(Math.max(...data.map((d) => d.opens)))
  // Recharts hides its tooltip when the mouse leaves, not when keyboard focus
  // does, so a tooltip opened with the arrow keys is hidden here on blur.
  const [blurred, setBlurred] = useState(false)
  return (
    <ChartContainer
      config={config}
      className={`aspect-auto h-full w-full ${surfaceFocus} ${className}`}
      onFocus={() => setBlurred(false)}
      onBlur={() => setBlurred(true)}
      onPointerDown={() => setBlurred(false)}
      onPointerMove={() => setBlurred(false)}
    >
      <BarChart
        data={data}
        margin={{ top: 8, right: 14, bottom: 0, left: 0 }}
        barCategoryGap={2}
        accessibilityLayer
        role="img"
        title={title}
        desc={summary}
      >
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="key"
          ticks={labelled}
          interval={0}
          tickFormatter={tick}
          tickLine={false}
          axisLine={{ stroke: BASELINE }}
          tickMargin={8}
          fontSize={12}
        />
        <YAxis
          allowDecimals={false}
          ticks={ticks}
          domain={[0, ticks[ticks.length - 1]]}
          interval={0}
          tickLine={false}
          axisLine={false}
          width={28}
          tickMargin={4}
          fontSize={12}
        />
        <ChartTooltip
          active={blurred ? false : undefined}
          cursor={{ fill: "rgba(245, 234, 241, 0.06)" }}
          isAnimationActive={false}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const opens = Number(payload[0].value) || 0
            return (
              <div className="rounded-xl bg-night-plum px-3 py-2 shadow-xl ring-1 ring-inset ring-night-petal/15">
                <p className="text-sm font-semibold text-night-petal">{plural(opens, "open", "opens")}</p>
                <p className="mt-0.5 text-xs text-night-lilac">{tooltipLabel(String(label))}</p>
              </div>
            )
          }}
        />
        <Bar
          dataKey="opens"
          fill="var(--color-opens)"
          activeBar={{ fill: "#F1C4A9" }}
          radius={[4, 4, 0, 0]}
          maxBarSize={24}
          isAnimationActive={!reducedMotion}
          animationDuration={700}
          animationEasing="ease-out"
        />
      </BarChart>
    </ChartContainer>
  )
}
