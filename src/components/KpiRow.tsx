import type { ReactNode } from "react";
import { formatShortDay } from "../sim/calendar";
import type { GameState, Snapshot } from "../sim/types";
import { useGame } from "../state/store";
import { METRICS, type MetricKey } from "../ui/metrics";
import { Sparkline } from "./Sparkline";
import { MetricTip, StatusBadge, Tip } from "./Tip";

/**
 * Key stats. The four that decide the game get big "hero" cards with
 * sparklines; supporting indicators sit in a compact grid beside them.
 */
interface Stat {
  metric: MetricKey;
  label: string;
  value: string;
  delta: number;
  deltaText: string;
  sub: ReactNode;
  /** "Good" when the number goes down (e.g. unemployment) */
  invert?: boolean;
  spark?: { key: keyof Snapshot; days: number; reference?: number; hourly?: boolean };
}

const pct = (v: number, d = 2) => `${v.toFixed(d)}%`;
const signed = (v: number, d: number, unit = "") => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}${unit}`;

function heroes(g: GameState): Stat[] {
  const r = g.reported;
  const e = g.econ;
  const dayPct = (e.stockIndex / g.prevClose.stock - 1) * 100;
  const implied = g.marketExpected - e.policyRate;
  return [
    {
      metric: "cpi", label: "Core Inflation", value: pct(r.cpi.value, 1),
      delta: r.cpi.value - r.cpi.prev, deltaText: `${signed(r.cpi.value - r.cpi.prev, 1)} vs last month`, invert: true,
      sub: <>Target <b>2.0%</b> · est. {pct(r.cpi.consensus, 1)} · {formatShortDay(r.cpi.day)}</>,
      spark: { key: "cpi", days: 260, reference: 2 },
    },
    {
      metric: "unemployment", label: "Unemployment", value: pct(r.unemployment.value, 1),
      delta: r.unemployment.value - r.unemployment.prev, deltaText: `${signed(r.unemployment.value - r.unemployment.prev, 1)} vs last month`, invert: true,
      sub: <>Natural <b>~{e.naturalUnemployment.toFixed(1)}%</b> · {formatShortDay(r.unemployment.day)}</>,
      spark: { key: "unemployment", days: 260, reference: e.naturalUnemployment },
    },
    {
      metric: "fedFunds", label: "Fed Funds Rate", value: pct(e.policyRate),
      delta: implied, deltaText: Math.abs(implied) < 0.03 ? "Markets expect a hold" : `Markets price ${signed(implied * 100, 0, "bp")}`,
      sub: <>Real rate <b>{signed(e.policyRate - r.cpi.value, 1, "%")}</b> · balance sheet ${e.balanceSheet.toFixed(1)}T</>,
      spark: { key: "policyRate", days: 260 },
    },
    {
      metric: "stocks", label: "STX 500", value: e.stockIndex.toFixed(0),
      delta: dayPct, deltaText: `${signed(dayPct, 2, "%")} today`,
      sub: <>{(-(1 - e.stockIndex / e.stockHigh) * 100).toFixed(1)}% from high</>,
      spark: { key: "stockIndex", days: 5, hourly: true },
    },
  ];
}

function secondary(g: GameState): Stat[] {
  const h = g.history;
  const r = g.reported;
  const e = g.econ;
  const homeYoY = (r.homePrice.value / h[Math.max(0, h.length - 261)].homePrice - 1) * 100;
  return [
    { metric: "payrolls", label: "Payrolls", value: `${r.payrolls.value >= 0 ? "+" : ""}${Math.round(r.payrolls.value)}K`, delta: r.payrolls.value - r.payrolls.consensus, deltaText: `${signed(r.payrolls.value - r.payrolls.consensus, 0, "K")} vs est`, sub: "" },
    { metric: "gdp", label: "GDP Growth", value: pct(r.gdp.value, 1), delta: r.gdp.value - r.gdp.prev, deltaText: signed(r.gdp.value - r.gdp.prev, 1), sub: "" },
    { metric: "claims", label: "Jobless Claims", value: `${Math.round(r.claims.value)}K`, delta: r.claims.value - r.claims.prev, deltaText: signed(r.claims.value - r.claims.prev, 0, "K"), sub: "", invert: true },
    { metric: "y10", label: "10Y Treasury", value: pct(e.yield10y), delta: e.yield10y - g.prevClose.y10, deltaText: `${signed((e.yield10y - g.prevClose.y10) * 100, 0)}bp`, sub: "", invert: true },
    { metric: "mortgage", label: "30Y Mortgage", value: pct(e.mortgageRate), delta: e.mortgageRate - g.prevClose.mortgage, deltaText: `${signed((e.mortgageRate - g.prevClose.mortgage) * 100, 0)}bp`, sub: "", invert: true },
    { metric: "home", label: "Home Prices", value: signed(homeYoY, 1, "%"), delta: homeYoY, deltaText: "YoY", sub: "" },
  ];
}

function sparkValues(g: GameState, s: NonNullable<Stat["spark"]>): number[] {
  const src = s.hourly ? g.intraday.slice(-s.days * 7) : g.history.slice(-s.days).filter((_, i) => i % 2 === 0);
  const out = src.map((p) => p[s.key] as number);
  if (!s.hourly) out.push(g.intraday[g.intraday.length - 1]?.[s.key] as number ?? out[out.length - 1]);
  return out;
}

function direction(s: Stat) {
  if (Math.abs(s.delta) < 1e-9) return "";
  return (s.invert ? s.delta < 0 : s.delta > 0) ? "up" : "down";
}

export function KpiRow() {
  const game = useGame((s) => s.game);
  return (
    <section className="kpi-zone">
      <div className="heroes">
        {heroes(game).map((s) => {
          const a = METRICS[s.metric].assess(game);
          const dir = direction(s);
          return (
            <Tip key={s.label} className={`hero lvl-${a.level}`} content={<MetricTip metric={s.metric} />}>
              <div className="hero-top">
                <span className="hero-label">{s.label} <span className="info-i">ⓘ</span></span>
                <StatusBadge level={a.level} label={a.label} />
              </div>
              <div className="hero-mid">
                <span key={s.value} className={`hero-value flash-${dir || "none"}`}>{s.value}</span>
                {s.spark && <Sparkline values={sparkValues(game, s.spark)} reference={s.spark.reference} className={`hero-spark lvl-${a.level}`} />}
              </div>
              <div className={`hero-delta ${dir}`}>
                {s.delta > 0 ? "▲" : s.delta < 0 ? "▼" : "•"} {s.deltaText}
              </div>
              <div className="hero-sub">{s.sub}</div>
            </Tip>
          );
        })}
      </div>
      <div className="minis">
        {secondary(game).map((s) => {
          const a = METRICS[s.metric].assess(game);
          const dir = direction(s);
          return (
            <Tip key={s.label} className={`mini lvl-${a.level}`} content={<MetricTip metric={s.metric} />}>
              <div className="mini-label">{s.label}</div>
              <div className="mini-row">
                <span key={s.value} className={`mini-value flash-${dir || "none"}`}>{s.value}</span>
                <StatusBadge level={a.level} label={a.label} />
              </div>
              <div className={`mini-delta ${dir}`}>{s.deltaText}</div>
            </Tip>
          );
        })}
      </div>
    </section>
  );
}
