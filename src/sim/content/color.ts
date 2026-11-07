import { P } from "../config";
import { drawdown } from "../economy";
import { preferredRate } from "../fomc";
import { scheduledReleases } from "../releases";
import type { Rng } from "../rng";
import type { GameState, NewsItem } from "../types";
import type { Persona } from "./accounts";

/**
 * Background "color" between the big moments: Fed officials' speeches,
 * corporate earnings (fictional companies), data previews and midday market
 * wraps. Flavor only — but Fed-speak honestly reflects each member's view,
 * so it doubles as a hint about the next vote.
 */
type NewsDraft = Omit<NewsItem, "id" | "day">;
export interface ColorOut {
  news: NewsDraft[];
  posts: { p: Persona; text: string }[];
}

const pick = <T,>(rng: Rng, xs: T[]): T => xs[Math.floor(rng.next() * xs.length)];
const f1 = (x: number) => x.toFixed(1);

// ---------------------------------------------------------------- Fed-speak

const HAWK = [
  "Inflation is not yet beaten.",
  "I would support further tightening.",
  "We must not ease prematurely.",
  "Price stability is the foundation of everything else.",
  "The job is not done.",
  "I see upside risks to inflation.",
  "Cutting now would be a mistake.",
];
const DOVE = [
  "Risks to employment are rising.",
  "Policy is sufficiently restrictive.",
  "I see room to ease in the coming months.",
  "We should be careful not to overtighten.",
  "The labor market is showing cracks.",
  "Patience has costs too.",
  "Holding rates this high risks real damage.",
];
const NEUTRAL = [
  "Policy is well positioned.",
  "We can afford to be patient.",
  "I'll be watching the data closely.",
  "Risks are two-sided right now.",
  "Our next move could go either way.",
];

function fedSpeak(g: GameState, rng: Rng, out: ColorOut) {
  const members = g.members.filter((m) => m.role !== "Chair");
  const m = pick(rng, members);
  const view = {
    policyRate: g.econ.policyRate,
    inflation: g.reported.cpi.value,
    gapEst: (g.econ.naturalUnemployment - g.reported.unemployment.value) / P.okun,
  };
  const lean = preferredRate(m, view) - g.econ.policyRate;
  const quote = lean >= 0.25 ? pick(rng, HAWK) : lean <= -0.25 ? pick(rng, DOVE) : pick(rng, NEUTRAL);
  const where = m.district ? `${m.district} Fed` : "Fed Governor";
  out.news.push({ headline: `${m.name} (${where}): "${quote}"`, tone: "neutral" });
  const last = m.name.split(" ").pop();
  if (Math.abs(lean) >= 0.25 && rng.next() < 0.6)
    out.posts.push({
      p: "economist",
      text: `${last} sounding ${lean > 0 ? "hawkish" : "dovish"} today. ${lean > 0 ? "One more vote for a hike" : "One more vote for a cut"} at the next FOMC? 👀`,
    });
}

// ---------------------------------------------------------------- earnings

interface Company {
  name: string;
  ticker: string;
  /** −∞..∞: how good conditions are for this business right now */
  driver: (g: GameState) => number;
  beat: string[];
  miss: string[];
}

const COMPANIES: Company[] = [
  { name: "Zentrix Semiconductors", ticker: "ZNTX", driver: (g) => g.econ.stockMomentum / 25 + g.econ.demandShock, beat: ["on insatiable AI chip demand", "as data-center orders surge"], miss: ["as chip orders slow", "on an inventory glut"] },
  { name: "MegaMart", ticker: "MEGA", driver: (g) => g.reported.gdp.value - 1.5, beat: ["as shoppers trade down to discount stores", "on strong grocery sales"], miss: ["as shoppers pull back", "warning of a 'cautious consumer'"] },
  { name: "Northwind Airlines", ticker: "NWND", driver: (g) => g.reported.gdp.value - 1.5 - g.econ.supplyShock, beat: ["on record summer travel", "as fuel costs ease"], miss: ["as jet fuel costs bite", "on weak bookings"] },
  { name: "Ironclad Homes", ticker: "IRON", driver: (g) => 6.5 - g.econ.mortgageRate, beat: ["as buyers return", "on a surge in new orders"], miss: ["as mortgage rates scare off buyers", "with cancellations at a 2-year high"] },
  { name: "First Meridian Bank", ticker: "FMB", driver: (g) => (g.econ.policyRate - 3) / 2 - g.econ.financialStress * 2, beat: ["on fat lending margins", "as higher rates boost interest income"], miss: ["as loan losses mount", "on deposit outflows"] },
  { name: "Bolt Motors", ticker: "BOLT", driver: (g) => g.reported.gdp.value - 1 - (g.econ.mortgageRate - 6) / 2, beat: ["on strong EV deliveries", "as car demand holds up"], miss: ["as high loan rates crush car sales", "cutting production targets"] },
  { name: "Cloudnest", ticker: "CLDN", driver: (g) => g.econ.stockMomentum / 30, beat: ["on booming cloud subscriptions", "raising full-year guidance"], miss: ["as customers cut IT budgets", "lowering guidance"] },
  { name: "PetroAtlas", ticker: "PTRA", driver: (g) => g.econ.supplyShock * 2 + (g.reported.cpi.value - 3), beat: ["on soaring oil prices", "with record refining margins"], miss: ["as crude prices sag", "on weak refining margins"] },
  { name: "Burger Barn", ticker: "BRGR", driver: (g) => g.reported.gdp.value - 1 - (g.reported.cpi.value - 3) / 2, beat: ["as value menus draw crowds", "on strong same-store sales"], miss: ["as diners cut back", "blaming food-cost inflation"] },
  { name: "Helix Pharma", ticker: "HLX", driver: () => 0, beat: ["on blockbuster drug sales", "after a trial success"], miss: ["after a failed drug trial", "on patent-cliff worries"] },
];

function earnings(g: GameState, rng: Rng, out: ColorOut) {
  const c = pick(rng, COMPANIES);
  const score = c.driver(g) * 0.6 + rng.normal();
  const beat = score > 0;
  const move = (2 + Math.abs(score) * 4 + rng.next() * 3).toFixed(0);
  out.news.push({
    headline: `${c.name} ${beat ? "beats estimates" : "misses estimates"} ${pick(rng, beat ? c.beat : c.miss)}; shares ${beat ? "jump" : "slide"} ${move}%`,
    tone: beat ? "good" : "bad",
  });
  if (rng.next() < 0.7)
    out.posts.push({ p: "bro", text: beat ? `$${c.ticker} earnings beat. +${move}%. i am a genius 🚀` : `$${c.ticker} -${move}% after earnings. i'm holding. i'm fine. 🪦` });
}

// ---------------------------------------------------------------- assembly

/** Rates per trading day for each kind of color. */
const FED_SPEAK_PER_DAY = 0.35;
const EARNINGS_PER_DAY = 0.4;

/** Called every trading hour. `hoursPerDay` scales the per-day rates. */
export function colorFor(g: GameState, rng: Rng, hoursPerDay: number): ColorOut {
  const out: ColorOut = { news: [], posts: [] };
  if (rng.next() < FED_SPEAK_PER_DAY / hoursPerDay) fedSpeak(g, rng, out);
  if (rng.next() < EARNINGS_PER_DAY / hoursPerDay) earnings(g, rng, out);

  // First hour of the day: previews of tomorrow's big data, FOMC countdown
  if (g.hour === 1) {
    const tomorrow = scheduledReleases(g.econ.day + 1);
    if (tomorrow.includes("cpi"))
      out.news.push({ headline: pick(rng, ["Traders brace for tomorrow's inflation report", "All eyes on CPI tomorrow; options traders price a big move", "Inflation data due tomorrow could sway the Fed"]), tone: "neutral" });
    if (tomorrow.includes("payrolls"))
      out.news.push({ headline: pick(rng, ["Jobs report due tomorrow; economists split on hiring", "Wall Street awaits Friday's jobs numbers", "Will hiring hold up? Jobs report tomorrow"]), tone: "neutral" });
    const daysLeft = g.cycleLength - g.cycleDay;
    if (daysLeft === 5)
      out.news.push({ headline: `FOMC meets next week; futures price ${g.marketExpected.toFixed(2)}%`, tone: "neutral" });
  }

  // Midday wrap when markets are moving
  if (g.hour === 4) {
    const pct = (g.econ.stockIndex / g.prevClose.stock - 1) * 100;
    if (Math.abs(pct) >= 1)
      out.news.push({
        headline: pct > 0
          ? pick(rng, [`Midday: stocks rally ${f1(pct)}%, led by ${pick(rng, ["tech", "banks", "small caps", "consumer stocks"])}`, `Stocks climb ${f1(pct)}% by lunchtime`])
          : pick(rng, [`Midday: stocks slide ${f1(-pct)}% as ${pick(rng, ["yields rise", "selling accelerates", "tech stumbles", "nerves fray"])}`, `Stocks down ${f1(-pct)}% at midday`]),
        tone: pct > 0 ? "good" : "bad",
      });
    if (drawdown(g.econ) > 0.15 && rng.next() < 0.15)
      out.news.push({ headline: "Fund managers' cash levels hit highest since the last crisis", tone: "bad" });
  }
  return out;
}
