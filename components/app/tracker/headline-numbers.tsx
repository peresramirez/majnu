import { percent, type TrackerTotals } from "./analytics"
import { formatCount } from "./card"

const tile = "rounded-3xl bg-night-velvet p-4 ring-1 ring-inset ring-night-petal/10 sm:p-5"

// The Tracker's headline row (issue #75). The open rate leads, as the one big
// figure with a meter, and the four counts sit beside it: two by two on a
// phone, one row on a wide screen. Figures are Hanken Grotesk with its own
// proportional digits, never the display face.
export function HeadlineNumbers({ totals }: { totals: TrackerTotals }) {
  const rate = totals.openRate ?? 0
  const tiles = [
    { label: "Gifts sent", value: totals.giftsSent, hint: "Ready to be opened" },
    { label: "Gifts opened", value: totals.giftsOpened, hint: "At least once" },
    { label: "Opens", value: totals.opens, hint: "Pages and doors" },
    { label: "Unique visitors", value: totals.visitors, hint: "Once per gift" },
  ]

  return (
    <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
      <div className={`${tile} col-span-2 flex flex-col`}>
        <dt className="text-sm text-night-lilac">Open rate</dt>
        <dd className="mt-2 text-5xl font-semibold leading-none text-night-petal">{percent(rate)}</dd>
        <dd className="mt-auto pt-4">
          <div className="h-2 rounded-full bg-night-rose/15" aria-hidden="true">
            {rate > 0 && <div className="h-full rounded-full bg-night-rose" style={{ width: `${Math.max(rate * 100, 2)}%` }} />}
          </div>
          <p className="mt-2.5 text-sm text-night-lilac">
            {totals.giftsSent === 0
              ? "Send a gift to see how many are opened."
              : `${formatCount(totals.giftsOpened)} of ${formatCount(totals.giftsSent)} ${totals.giftsSent === 1 ? "gift" : "gifts"} opened`}
          </p>
        </dd>
      </div>
      {tiles.map((item) => (
        <div key={item.label} className={`${tile} flex flex-col`}>
          <dt className="text-sm text-night-lilac">{item.label}</dt>
          <dd className="mt-2 text-[28px] font-semibold leading-none text-night-petal sm:text-[32px]">{formatCount(item.value)}</dd>
          <dd className="mt-auto pt-2.5 text-xs leading-snug text-night-lilac">{item.hint}</dd>
        </div>
      ))}
    </dl>
  )
}
