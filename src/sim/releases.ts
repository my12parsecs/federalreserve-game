import { dayToDate } from "./calendar";
import { P } from "./config";
import type { Rng } from "./rng";
import type { Economy, Release, ReleaseKey, Reported } from "./types";

/**
 * The economic data calendar. The player never sees true macro values —
 * only these noisy, periodic releases, each compared against a consensus forecast.
 */
export function scheduledReleases(day: number): ReleaseKey[] {
  const d = dayToDate(day);
  const dow = d.getUTCDay();
  const dom = d.getUTCDate();
  const month = d.getUTCMonth();
  const out: ReleaseKey[] = [];
  if (dow === 4) out.push("claims"); // every Thursday
  if (dow === 5 && dom <= 7) out.push("unemployment", "payrolls"); // first Friday
  if (dow === 3 && dom >= 10 && dom <= 16) out.push("cpi"); // mid-month Wednesday
  if (dow === 2 && dom >= 22 && dom <= 28) out.push("homePrice"); // late-month Tuesday
  if (dow === 4 && dom >= 22 && dom <= 28 && month % 3 === 0) out.push("gdp"); // quarterly
  return out;
}

function trueValue(key: ReleaseKey, e: Economy): number {
  switch (key) {
    case "cpi":
      return e.inflation;
    case "unemployment":
      return e.unemployment;
    case "payrolls":
      return P.trendPayrolls - (e.unemployment - e.lastJobsU) * P.jobsPerPoint;
    case "gdp":
      return e.gdpGrowth;
    case "homePrice":
      return e.homePrice;
    case "claims": {
      const uPressure = e.naturalUnemployment - P.okun * e.outputGap - e.unemployment;
      return 215 * Math.exp(0.12 * (e.unemployment - e.naturalUnemployment) + 0.3 * uPressure);
    }
  }
}

/** Measurement noise, rounding precision, and forecaster error per series. */
const SPEC: Record<ReleaseKey, { noise: number; round: number; forecastErr: number }> = {
  cpi: { noise: 0.08, round: 0.1, forecastErr: 0.1 },
  unemployment: { noise: 0.05, round: 0.1, forecastErr: 0.05 },
  payrolls: { noise: 45, round: 1, forecastErr: 35 },
  gdp: { noise: 0.3, round: 0.1, forecastErr: 0.3 },
  homePrice: { noise: 0.3, round: 0.1, forecastErr: 0.3 },
  claims: { noise: 7, round: 1, forecastErr: 6 },
};

const roundTo = (x: number, step: number) => Math.round(x / step) * step;

export function makeRelease(key: ReleaseKey, e: Economy, prev: Release, day: number, rng: Rng): Release {
  const s = SPEC[key];
  const t = trueValue(key, e);
  return {
    value: roundTo(t + s.noise * rng.normal(), s.round),
    prev: prev.value,
    // Forecasters see the trend but not the noise
    consensus: roundTo(prev.value + 0.7 * (t - prev.value) + s.forecastErr * rng.normal(), s.round),
    day,
  };
}

export function initialReported(e: Economy): Reported {
  const r = (value: number): Release => ({ value, prev: value, consensus: value, day: e.day });
  return {
    cpi: r(roundTo(e.inflation, 0.1)),
    unemployment: r(roundTo(e.unemployment, 0.1)),
    payrolls: r(P.trendPayrolls),
    gdp: r(roundTo(e.gdpGrowth, 0.1)),
    homePrice: r(e.homePrice),
    claims: r(Math.round(trueValue("claims", e))),
  };
}

/**
 * How markets react to a data surprise (actual − consensus).
 * When inflation is hot, "good news is bad news": strong jobs mean more hikes.
 */
export function marketReaction(
  key: ReleaseKey,
  surprise: number,
  latestCpi: number,
): { stockPct: number; yieldChg: number } {
  const hot = latestCpi > 3;
  switch (key) {
    case "cpi":
      return { stockPct: -5 * surprise, yieldChg: 0.4 * surprise };
    case "unemployment":
      return { stockPct: (hot ? 4 : -4) * surprise, yieldChg: -0.3 * surprise };
    case "payrolls":
      return { stockPct: (hot ? -0.008 : 0.004) * surprise, yieldChg: 0.0008 * surprise };
    case "gdp":
      return { stockPct: 0.6 * surprise, yieldChg: 0.05 * surprise };
    case "claims":
      return { stockPct: -0.01 * surprise, yieldChg: -0.001 * surprise };
    case "homePrice":
      return { stockPct: 0, yieldChg: 0 };
  }
}
