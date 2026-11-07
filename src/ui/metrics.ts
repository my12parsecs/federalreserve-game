import { P } from "../sim/config";
import { drawdown } from "../sim/economy";
import type { GameState } from "../sim/types";

/**
 * Plain-language explanations and OK / WATCH / DANGER ratings for every metric.
 * UI-only: the simulation doesn't use these thresholds (except the game-over limits).
 */
export type Level = "ok" | "watch" | "bad" | "info";

export interface Assessment {
  level: Level;
  /** Short status word shown on the badge */
  label: string;
  /** One line on why it has this rating */
  note: string;
}

export interface MetricInfo {
  title: string;
  what: string;
  why: string;
  scale: { level: Level; text: string }[];
  assess: (g: GameState) => Assessment;
}

const ok = (note: string, label = "OK"): Assessment => ({ level: "ok", label, note });
const watch = (note: string, label = "WATCH"): Assessment => ({ level: "watch", label, note });
const bad = (note: string, label = "DANGER"): Assessment => ({ level: "bad", label, note });

const yearAgo = (g: GameState) => g.history[Math.max(0, g.history.length - 261)];
const homeYoY = (g: GameState) => (g.reported.homePrice.value / yearAgo(g).homePrice - 1) * 100;
const stock1y = (g: GameState) => (g.econ.stockIndex / yearAgo(g).stockIndex - 1) * 100;

export const METRICS = {
  fedFunds: {
    title: "Fed Funds Rate",
    what: "The interest rate you control. Banks lend to each other overnight at this rate, and it ripples out to every loan in the economy.",
    why: "Higher rates cool spending and inflation (with a lag of ~6–12 months). Lower rates boost jobs and growth but risk inflation.",
    scale: [
      { level: "info", text: "Restrictive: well above inflation + ~0.75% neutral" },
      { level: "info", text: "Stimulative: below inflation + ~0.75%" },
    ],
    assess: (g) => {
      const real = g.econ.policyRate - g.reported.cpi.value;
      if (real > 1.5) return { level: "info", label: "TIGHT", note: `Real rate ${real.toFixed(1)}% — strongly restrictive` };
      if (real > 0.25) return { level: "info", label: "RESTRICTIVE", note: `Real rate ${real.toFixed(1)}% — leaning on the brakes` };
      if (real > -0.75) return { level: "info", label: "NEUTRAL", note: `Real rate ${real.toFixed(1)}% — roughly neutral` };
      return { level: "info", label: "LOOSE", note: `Real rate ${real.toFixed(1)}% — pressing the gas` };
    },
  },
  cpi: {
    title: "Core Inflation",
    what: "How fast prices are rising, excluding volatile food and energy. Released monthly (mid-month).",
    why: "Your #1 job. The target is 2%. Too high erodes paychecks and your credibility; too low risks a deflation spiral.",
    scale: [
      { level: "ok", text: "1.25% – 2.75%" },
      { level: "watch", text: "2.75% – 5%, or below 1.25%" },
      { level: "bad", text: "Above 5% or below 0%. Game over at 10%." },
    ],
    assess: (g) => {
      const v = g.reported.cpi.value;
      if (v >= 5) return bad(`${v.toFixed(1)}% — far above target. Game over at ${P.maxInflation}%`);
      if (v <= 0) return bad("Prices falling — deflation risk");
      if (v >= 2.75) return watch(`${(v - 2).toFixed(1)} pts above the 2% target`);
      if (v <= 1.25) return watch("Below target — risk of too-weak demand");
      return ok("Near the 2% target");
    },
  },
  unemployment: {
    title: "Unemployment Rate",
    what: "Share of people looking for work who can't find it. Released with the monthly jobs report (first Friday).",
    why: "Your #2 job. The economy's 'natural' rate is about 4.2%. Much lower means overheating (wage-driven inflation); higher means hardship.",
    scale: [
      { level: "ok", text: "3.4% – 5.2%" },
      { level: "watch", text: "Below 3.4% (overheating) or 5.2% – 7%" },
      { level: "bad", text: "Above 7%. Game over at 11%." },
    ],
    assess: (g) => {
      const v = g.reported.unemployment.value;
      const u = g.econ.naturalUnemployment;
      if (v >= 7) return bad(`${v.toFixed(1)}% — recession-level. Game over at ${P.maxUnemployment}%`);
      if (v >= u + 1) return watch("Rising joblessness");
      if (v <= u - 0.8) return watch("Very tight — wages may fuel inflation", "HOT");
      return ok("Near the natural rate (~4.2%)");
    },
  },
  payrolls: {
    title: "Nonfarm Payrolls",
    what: "Jobs added (or lost) last month. The headline number of the monthly jobs report.",
    why: "About +100K a month keeps unemployment steady. Negative numbers usually mean a recession is starting.",
    scale: [
      { level: "ok", text: "+75K to +300K" },
      { level: "watch", text: "0 to +75K, or above +300K (overheating)" },
      { level: "bad", text: "Negative — jobs being lost" },
    ],
    assess: (g) => {
      const v = g.reported.payrolls.value;
      if (v < 0) return bad("The economy is losing jobs");
      if (v < 75) return watch("Hiring is slowing");
      if (v > 300) return watch("Red-hot hiring", "HOT");
      return ok("Healthy hiring");
    },
  },
  gdp: {
    title: "Real GDP Growth",
    what: "How fast the economy's total output is growing (annualized, after inflation). Released quarterly.",
    why: "Trend growth is ~1.8%. Above that the economy overheats; negative growth means recession.",
    scale: [
      { level: "ok", text: "1% – 4%" },
      { level: "watch", text: "0% – 1% (stalling) or above 4% (overheating)" },
      { level: "bad", text: "Negative — the economy is shrinking" },
    ],
    assess: (g) => {
      const v = g.reported.gdp.value;
      if (v < 0) return bad("Economy contracting");
      if (v < 1) return watch("Growth stalling");
      if (v > 4) return watch("Overheating", "HOT");
      return ok("Solid growth");
    },
  },
  y10: {
    title: "10-Year Treasury Yield",
    what: "The interest rate the government pays to borrow for 10 years. Set by the bond market every day.",
    why: "Mortgages and corporate loans are priced off this. It moves on your guidance, inflation data, and QE/QT — not just your rate.",
    scale: [
      { level: "ok", text: "Below 4.75%" },
      { level: "watch", text: "4.75% – 5.5%" },
      { level: "bad", text: "Above 5.5% — financial conditions very tight" },
    ],
    assess: (g) => {
      const v = g.econ.yield10y;
      if (v >= 5.5) return bad("Very high long rates");
      if (v >= 4.75) return watch("Elevated long rates");
      return ok("Normal range");
    },
  },
  mortgage: {
    title: "30-Year Mortgage Rate",
    what: "What a typical homebuyer pays for a fixed-rate mortgage. Roughly the 10-year yield + 1.8%.",
    why: "The main channel from your policy to housing. High mortgage rates freeze the housing market.",
    scale: [
      { level: "ok", text: "Below 7%" },
      { level: "watch", text: "7% – 8%" },
      { level: "bad", text: "Above 8% — housing freezes" },
    ],
    assess: (g) => {
      const v = g.econ.mortgageRate;
      if (v >= 8) return bad("Housing affordability crisis");
      if (v >= 7) return watch("Homes getting unaffordable");
      return ok("Housing can function");
    },
  },
  stocks: {
    title: "STX 500 Stock Index",
    what: "A broad index of 500 large companies. Moves every trading day.",
    why: "Rising stocks make people feel richer and spend more (the 'wealth effect'). Crashes raise financial stress. Surprising the market moves it instantly.",
    scale: [
      { level: "ok", text: "Within 10% of its high" },
      { level: "watch", text: "10–20% below high (correction), or up >25% in a year (frothy)" },
      { level: "bad", text: "20%+ below high — bear market" },
    ],
    assess: (g) => {
      const dd = drawdown(g.econ) * 100;
      if (dd >= 20) return bad(`Bear market: ${dd.toFixed(0)}% below peak`);
      if (dd >= 10) return watch(`Correction: ${dd.toFixed(0)}% below peak`);
      if (stock1y(g) > 25) return watch(`Up ${stock1y(g).toFixed(0)}% in a year — frothy`, "FROTHY");
      return ok(dd < 1 ? "At record highs" : `${dd.toFixed(1)}% below peak`);
    },
  },
  home: {
    title: "Home Prices (year over year)",
    what: "How much home prices changed over the past 12 months. Released monthly.",
    why: "Housing is most families' biggest asset. Falling prices hurt spending and banks; booming prices hurt affordability.",
    scale: [
      { level: "ok", text: "−2% to +10%" },
      { level: "watch", text: "−5% to −2%, or above +10% (bubble)" },
      { level: "bad", text: "Below −5% — housing bust" },
    ],
    assess: (g) => {
      const v = homeYoY(g);
      if (v <= -5) return bad("Housing bust");
      if (v <= -2) return watch("Prices falling");
      if (v >= 10) return watch("Bubble territory", "FROTHY");
      return ok("Stable housing market");
    },
  },
  claims: {
    title: "Initial Jobless Claims",
    what: "New unemployment-insurance filings each week. Released every Thursday — the fastest read on layoffs.",
    why: "An early warning: claims rise before the unemployment rate does.",
    scale: [
      { level: "ok", text: "Below 250K" },
      { level: "watch", text: "250K – 300K" },
      { level: "bad", text: "Above 300K — layoffs spreading" },
    ],
    assess: (g) => {
      const v = g.reported.claims.value;
      if (v >= 300) return bad("Layoffs spreading");
      if (v >= 250) return watch("Layoffs creeping up");
      return ok("Few layoffs");
    },
  },
  expectations: {
    title: "Inflation Expectations",
    what: "How much inflation the public expects in the future (dashed line on the inflation chart).",
    why: "If people expect high inflation, they demand raises and set prices accordingly — making it self-fulfilling. Credibility keeps this anchored at 2%.",
    scale: [
      { level: "ok", text: "1.5% – 2.5%" },
      { level: "watch", text: "2.5% – 3%" },
      { level: "bad", text: "Above 3% — de-anchored" },
    ],
    assess: (g) => {
      const v = g.econ.inflationExp;
      if (v >= 3) return bad("Expectations de-anchoring");
      if (v >= 2.5 || v <= 1.5) return watch("Drifting from 2%");
      return ok("Anchored near 2%");
    },
  },
  credibility: {
    title: "Fed Credibility",
    what: "How much markets and the public trust you to hit 2% inflation.",
    why: "High credibility keeps expectations anchored, so inflation comes down more easily. It erodes when inflation stays off target, when you lose votes, or contradict your own guidance.",
    scale: [
      { level: "ok", text: "Above 60" },
      { level: "watch", text: "35 – 60" },
      { level: "bad", text: "Below 35. Game over at 8." },
    ],
    assess: (g) => {
      const v = g.econ.credibility * 100;
      if (v < 35) return bad(`${v.toFixed(0)} — markets doubt you. Game over at ${P.minCredibility * 100}`);
      if (v < 60) return watch(`${v.toFixed(0)} — trust slipping`);
      return ok(`${v.toFixed(0)} — trusted`);
    },
  },
  marketPricing: {
    title: "Market Pricing (Fed funds futures)",
    what: "The rate traders expect you to set at the next meeting, based on data and your speeches.",
    why: "Deliver something different and markets jolt: a hawkish surprise drops stocks and lifts yields, a dovish one does the opposite.",
    scale: [{ level: "info", text: "Matching expectations = calm markets" }],
    assess: (g) => {
      const d = g.marketExpected - g.econ.policyRate;
      return { level: "info", label: Math.abs(d) < 0.05 ? "HOLD" : d > 0 ? "HIKE" : "CUT", note: `${d >= 0 ? "+" : "−"}${Math.round(Math.abs(d) * 100)}bp priced for the next meeting` };
    },
  },
} satisfies Record<string, MetricInfo>;

export type MetricKey = keyof typeof METRICS;
