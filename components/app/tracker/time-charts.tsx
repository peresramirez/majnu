"use client"

import dynamic from "next/dynamic"
import type { ReactNode } from "react"
import { plural } from "../format"
import {
  CHART_DAYS,
  dailySummary,
  dayLabel,
  dayTick,
  hourlySummary,
  hourRange,
  hourTick,
  opensByHour,
  opensPerDay,
} from "./analytics"
import { DashboardCard, formatCount } from "./card"
import { useViewerTimeZone } from "./use-time-zone"

// Recharts loads on its own, after the page has painted, and only here.
const OpensColumnChart = dynamic(() => import("./charts").then((m) => m.OpensColumnChart), { ssr: false })

// The two time charts of the Tracker (issue #75). Their days and hours are in
// the viewer's timezone, so they are computed in the browser: UTC in the
// server's HTML, the viewer's own right after hydration (use-time-zone.ts).
// Each card says what its chart shows in words and has the values in a table
// for screen readers, so nothing depends on the chart having loaded.

export function OpensPerDay({ times, now, className = "" }: { times: string[]; now: string; className?: string }) {
  const timeZone = useViewerTimeZone() ?? "UTC"
  const days = opensPerDay(times, timeZone, new Date(now))
  const total = days.reduce((sum, day) => sum + day.opens, 0)
  const today = days[days.length - 1].key
  // A label every week, ending on today.
  const ticks = days.filter((_, i) => (days.length - 1 - i) % 7 === 0).map((day) => day.key)
  const summary = dailySummary(days)

  return (
    <DashboardCard id="opens-per-day" title="Opens per day" subtitle={`Last ${CHART_DAYS} days`} figure={formatCount(total)} className={className}>
      <ChartArea empty={total === 0} summary={summary}>
        <OpensColumnChart
          data={days}
          ticks={ticks}
          tick={(key) => (key === today ? "Today" : dayTick(key))}
          tooltipLabel={(key) => (key === today ? `Today, ${dayLabel(key)}` : dayLabel(key, "long"))}
          title={`Opens per day, last ${CHART_DAYS} days`}
          summary={`${plural(total, "open", "opens")} in the last ${CHART_DAYS} days. ${summary}`}
        />
      </ChartArea>
      <HiddenTable
        caption={`Opens per day in the last ${CHART_DAYS} days, days with opens only`}
        head={["Day", "Opens"]}
        rows={days.filter((day) => day.opens > 0).map((day) => [dayLabel(day.key, "long"), day.opens])}
      />
    </DashboardCard>
  )
}

export function OpensByHour({ times, className = "" }: { times: string[]; className?: string }) {
  const timeZone = useViewerTimeZone() ?? "UTC"
  const hours = opensByHour(times, timeZone)
  const empty = hours.every((h) => h.opens === 0)
  const data = hours.map((h) => ({ key: hourTick(h.hour), opens: h.opens }))
  const summary = hourlySummary(hours)

  return (
    <DashboardCard id="opens-by-hour" title="Time of day" subtitle="Every open, by the hour" className={className}>
      <ChartArea empty={empty} summary={summary}>
        <OpensColumnChart
          data={data}
          ticks={["00:00", "06:00", "12:00", "18:00"]}
          tick={(key) => key}
          tooltipLabel={(key) => hourRange(Number(key.slice(0, 2)))}
          title="Opens by hour of the day"
          summary={summary}
        />
      </ChartArea>
      <HiddenTable
        caption="Opens by hour of the day, hours with opens only"
        head={["Hour", "Opens"]}
        rows={hours.filter((h) => h.opens > 0).map((h) => [hourRange(h.hour), h.opens])}
      />
    </DashboardCard>
  )
}

// The chart's box keeps its height while Recharts loads, so nothing moves.
// Before the first open the summary sits over the empty grid, as the chart's
// own empty state.
function ChartArea({ empty, summary, children }: { empty: boolean; summary: string; children: ReactNode }) {
  return (
    <>
      {!empty && <p className="mt-1 text-sm text-night-lilac">{summary}</p>}
      <div className="relative mt-4 h-44 sm:h-52">
        {children}
        {empty && (
          <p className="pointer-events-none absolute inset-x-6 top-[38%] -translate-y-1/2 text-center text-sm text-night-lilac">
            <span className="rounded-full bg-night-velvet px-3 py-1">{summary}</span>
          </p>
        )}
      </div>
    </>
  )
}

// Wrapped in a div: a table ignores sr-only's 1px width and would widen the page.
function HiddenTable({ caption, head, rows }: { caption: string; head: [string, string]; rows: [string, number][] }) {
  return (
    <div className="sr-only">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{head[0]}</th>
            <th scope="col">{head[1]}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2}>No opens yet</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
