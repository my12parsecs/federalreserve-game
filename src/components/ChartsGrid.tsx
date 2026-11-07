import { memo, useMemo, useState } from "react";
import type { Snapshot } from "../sim/types";
import { useGame } from "../state/store";
import { METRICS, type MetricKey } from "../ui/metrics";
import { LineChart, type Series } from "./LineChart";
import { MetricTip, StatusBadge, Tip } from "./Tip";

/** Chart ranges in trading days. 1M uses hourly data. */
const RANGES = { "1M": 21, "6M": 130, "2Y": 520 } as const;
type Range = keyof typeof RANGES;

interface ChartDef {
  title: string;
  /** Metric whose status badge & tooltip the chart header shows */
  metric: MetricKey;
  series: Series[];
  format: (v: number) => string;
  reference?: number;
  defaultRange: Range;
}

const pct = (v: number) => `${v.toFixed(2)}%`;

const CHARTS: ChartDef[] = [
  {
    title: "STX 500",
    metric: "stocks",
    format: (v) => v.toFixed(0),
    defaultRange: "1M",
    series: [{ key: "stockIndex", name: "STX 500", color: "var(--c-green)" }],
  },
  {
    title: "Rates",
    metric: "mortgage",
    format: pct,
    defaultRange: "1M",
    series: [
      { key: "yield10y", name: "10Y", color: "var(--c-purple)" },
      { key: "mortgageRate", name: "30Y mortgage", color: "var(--c-orange)", dashed: true },
      { key: "policyRate", name: "Fed funds", color: "var(--c-green)", step: true },
    ],
  },
  {
    title: "Inflation",
    metric: "cpi",
    format: pct,
    reference: 2,
    defaultRange: "2Y",
    series: [
      { key: "cpi", name: "Core CPI", color: "var(--c-red)", step: true },
      { key: "inflationExp", name: "Expectations", color: "var(--c-orange)", dashed: true },
    ],
  },
  {
    title: "Unemployment",
    metric: "unemployment",
    format: pct,
    defaultRange: "2Y",
    series: [{ key: "unemployment", name: "Unemployment rate", color: "var(--c-blue)", step: true }],
  },
  {
    title: "Jobless Claims (weekly)",
    metric: "claims",
    format: (v) => `${v.toFixed(0)}K`,
    defaultRange: "6M",
    series: [{ key: "claims", name: "Initial claims", color: "var(--c-purple)", step: true }],
  },
  {
    title: "Home Prices",
    metric: "home",
    format: (v) => v.toFixed(1),
    defaultRange: "2Y",
    series: [{ key: "homePrice", name: "Home price index", color: "var(--c-blue)", step: true }],
  },
];

/**
 * 1M: daily closes + hourly points (updates every trading hour).
 * 6M / 2Y: daily closes only, so these charts redraw once per trading day.
 * Long ranges also thin out old points to keep paths light.
 */
function chartData(history: Snapshot[], intraday: Snapshot[] | null, days: number): Snapshot[] {
  const now = intraday?.length ? intraday[intraday.length - 1].day : history[history.length - 1].day;
  const start = now - days;
  const firstHourly = intraday?.length ? intraday[0].day : Infinity;
  const out: Snapshot[] = [];
  for (const s of history) {
    if (s.day < start || s.day >= firstHourly) continue;
    if (days > 200 && now - s.day > 130 && s.day % 3 !== 0) continue;
    out.push(s);
  }
  if (intraday) for (const s of intraday) if (s.day >= start) out.push(s);
  return out;
}

export function ChartsGrid() {
  return (
    <section className="charts">
      {CHARTS.map((c) => (
        <Chart key={c.title} def={c} />
      ))}
    </section>
  );
}

/** Each chart subscribes only to what it draws, so unrelated ticks don't re-render it. */
const Chart = memo(function Chart({ def: c }: { def: ChartDef }) {
  const [range, setRange] = useState<Range>(c.defaultRange);
  const history = useGame((s) => s.game.history);
  const intraday = useGame((s) => (range === "1M" ? s.game.intraday : null));
  // Primitive selector → re-render only when the rating actually changes
  const status = useGame((s) => {
    const a = METRICS[c.metric].assess(s.game);
    return `${a.level}|${a.label}`;
  });
  const [level, label] = status.split("|");
  const data = useMemo(() => chartData(history, intraday, RANGES[range]), [history, intraday, range]);

  const last = data[data.length - 1];
  const first = data[0];
  const key = c.series[0].key;
  const change = (last[key] as number) - (first[key] as number);
  const changeText =
    key === "stockIndex"
      ? `${change >= 0 ? "+" : ""}${((change / (first[key] as number)) * 100).toFixed(1)}%`
      : `${change >= 0 ? "+" : ""}${c.format(change).replace("%", "")}${c.format(change).endsWith("%") ? "pt" : ""}`;

  return (
    <div className={`panel chart lvl-${level}`}>
      <div className="chart-head">
        <Tip className="chart-title" content={<MetricTip metric={c.metric} />}>
          <h3>
            {c.title} <span className="info-i">ⓘ</span>
          </h3>
          <StatusBadge level={level} label={label} />
        </Tip>
        <div className="ranges" role="group" aria-label={`${c.title} range`}>
          {(Object.keys(RANGES) as Range[]).map((r) => (
            <button key={r} className={r === range ? "on" : ""} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-sub">
        <span className="chart-last num">{c.format(last[key] as number)}</span>
        <span className={`chart-change num ${change > 0 ? "up" : change < 0 ? "down" : ""}`}>
          {changeText} <span className="muted">{range}</span>
        </span>
        <span className="legend">
          {c.series.map((s) => (
            <span key={s.key} className="legend-item">
              <i style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
        </span>
      </div>
      <LineChart data={data} series={c.series} format={c.format} reference={c.reference} shortRange={range === "1M"} />
    </div>
  );
});
