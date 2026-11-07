import { drawdown } from "./economy";
import type { Rng } from "./rng";
import { EVENT_BY_ID, resolve, type Voice as EventVoice } from "./content/events";
import type { Alert, GameState, SimEvent } from "./types";

/**
 * Picks out the big moments from a day's events and dresses them up as
 * "breaking news" popups: headline, what it means for the Chair, market
 * impact, and voices from (fictional) people. Flavor only.
 */
type Draft = Omit<Alert, "id" | "day">;
type Voice = Alert["voices"][number];

const f1 = (x: number) => x.toFixed(1);
const signed = (x: number, d = 1, unit = "") => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}${unit}`;

// ---------------------------------------------------------------- voices

const V = (name: string, role: string, text: string): Voice => ({ name, role, text });

const VOICES: Record<string, Voice[]> = {
  cpiHot: [
    V("Jess", "Nurse, Ohio", "My grocery receipt is longer than my shift. Nine dollars for cereal?"),
    V("Walter Brandt", "Kansas City Fed President", "I have been saying it for months. We are behind the curve."),
    V("Macro Mike", "Strategist", "Traders are pricing more hikes. Bonds getting crushed."),
  ],
  cpiCool: [
    V("Priya Anand", "Fed Governor", "Encouraging. Let's not declare victory, but this is real progress."),
    V("Chad Ventura", "Finance influencer", "COOL CPI = RATE CUTS = 🚀 (not financial advice) (it is though)"),
  ],
  jobsStrong: [
    V("Maria", "Bakery owner", "I'd hire two more people tomorrow if anyone applied."),
    V("Macro Mike", "Strategist", "Great for workers. Awkward for a Fed trying to cool inflation."),
  ],
  jobsWeak: [
    V("Dev", "Software engineer", "Laid off on a 4-minute Zoom call. Camera off. Classy."),
    V("Sofia Reyes", "Minneapolis Fed President", "Every tenth of a point of unemployment is real families. We need to be careful."),
    V("Sen. Dale Brooks", "Senator (fictional)", "Where is the Fed while Americans lose their jobs?"),
  ],
  recession: [
    V("Dr. Ana Kowalski", "Economist", "The economy is shrinking. The question now is how deep and how long."),
    V("Maria", "Bakery owner", "I'm cutting hours before I cut people. For now."),
  ],
  bearMarket: [
    V("Grandpa Lou", "Retiree", "My 401(k) is now a 201(k). Still not selling."),
    V("Brayden", "Options trader, 24", "Bro what is a bear market. Why is it called that. Why is it happening to me."),
  ],
  correction: [V("Macro Mike", "Strategist", "Ten percent off the highs. Healthy correction or the start of something worse?")],
  recordHigh: [
    V("Chad Ventura", "Finance influencer", "ALL. TIME. HIGHS. Thank you Chair 🙏🚀"),
    V("Gold Bug Gary", "Doomer", "Record highs while people can't afford eggs. This ends badly."),
  ],
  mortgage: [
    V("Priya & Sam", "First-time homebuyers", "Our dream house costs $900 more a month than it did last year. We're renting another year."),
    V("Karen V.", "Realtor, Arizona", "Open houses are ghost towns. Sellers won't drop prices, buyers can't afford them."),
  ],
  yield5: [V("Grandpa Lou", "Retiree", "Five percent on Treasuries! Finally, savers win one."), V("Macro Mike", "Strategist", "The bond market is doing the Fed's tightening for it.")],
  marketDown: [V("Brayden", "Options trader, 24", "I'm not looking at my account until Thursday."), V("Grandpa Lou", "Retiree", "Turn off the TV. Markets go down. Markets go up.")],
  marketUp: [V("Chad Ventura", "Finance influencer", "Told you. Buy. The. Dip. 🚀")],
  hike: [
    V("Jess", "Nurse, Ohio", "My credit card is at 27% APR now. Thanks, I guess."),
    V("Grandpa Lou", "Retiree", "My savings account finally pays something. Good call, Chair."),
  ],
  cut: [
    V("Priya & Sam", "First-time homebuyers", "Does this mean mortgage rates come down?? Please say yes."),
    V("Walter Brandt", "Kansas City Fed President", "Premature. We'll regret this when inflation comes back."),
  ],
  hold: [V("Macro Mike", "Strategist", "Steady as she goes. Markets love a boring Fed.")],
  failed: [
    V("Fed Watcher", "Fed historian", "A Chair losing an FOMC vote is almost unheard of. This is an institutional crisis."),
    V("Chad Ventura", "Finance influencer", "Fed civil war 🍿🍿🍿"),
  ],
  intro: [
    V("Jess", "Nurse, Ohio", "Please just make groceries cheaper. That's all I want."),
    V("Maria", "Bakery owner, Ohio", "And don't make my business loan more expensive. Thanks!"),
    V("Dr. Ana Kowalski", "Economist", "Inflation's sticky, the labor market's tight. Tough first meeting."),
  ],
};

function voices(key: string, rng: Rng, n = 3): Voice[] {
  return pickVoices(VOICES[key] ?? [], rng, n);
}

function pickVoices<T extends Voice | EventVoice>(list: T[], rng: Rng, n = 3): T[] {
  const pool = list.slice();
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng.next() * pool.length), 1)[0]);
  return out;
}

// ---------------------------------------------------------------- explanations

// ---------------------------------------------------------------- assembly

function marketImpacts(events: SimEvent[]): Alert["impacts"] {
  const close = events.find((e): e is Extract<SimEvent, { kind: "close" }> => e.kind === "close");
  if (!close) return [];
  return [
    { label: "STX 500", value: signed(close.stockPct, 1, "%"), tone: close.stockPct >= 0 ? "good" : "bad" },
    { label: "10Y yield", value: `${signed(close.yieldChg * 100, 0)}bp`, tone: "neutral" },
  ];
}

export function alertsFor(events: SimEvent[], g: GameState, rng: Rng): Draft[] {
  const out: Draft[] = [];
  const impacts = marketImpacts(events);
  let covered = false; // whether something already explains today's market move

  for (const ev of events) {
    if (ev.kind === "shock" && EVENT_BY_ID[ev.id]) {
      const d = EVENT_BY_ID[ev.id];
      const p = ev.params;
      out.push({
        kind: "shock", priority: 3, kicker: "Breaking", art: ev.id, metric: d.popup.metric,
        headline: d.popup.headline(p), body: d.popup.body(p),
        // The event's own figures first, then how markets reacted
        impacts: [...d.stats(p), ...impacts].slice(0, 4),
        voices: pickVoices(d.voices, rng).map((v) => ({ ...v, text: resolve(v.text, p) })),
      });
      covered = true;
    }

    if (ev.kind === "release") {
      const { key, release: r, surprise: s } = ev;
      const vsEst = { label: "vs. forecast", value: `${f1(r.consensus)}${key === "payrolls" || key === "claims" ? "K" : "%"}`, tone: "neutral" as const };
      if (key === "cpi" && Math.abs(s) >= 0.15) {
        const hot = s > 0;
        out.push({
          kind: "data", priority: 2, kicker: "Data shock", art: hot ? "cpiHot" : "cpiCool", metric: "cpi",
          headline: hot
            ? r.value >= 3 ? `Inflation runs hot: ${f1(r.value)}%` : `Inflation hotter than expected: ${f1(r.value)}%`
            : r.value <= 2.5 ? `Inflation cools to ${f1(r.value)}%` : `Inflation cooler than expected: ${f1(r.value)}%`,
          body: hot
            ? "Prices rose faster than economists expected. Markets now bet you'll have to be tougher — and hawks on the committee are getting louder."
            : "Price pressures eased more than expected. Doves will push for relief; hawks will say one month isn't a trend.",
          impacts: [{ label: "Core CPI", value: `${f1(r.value)}%`, tone: hot ? "bad" : "good" }, vsEst, ...impacts],
          voices: voices(hot ? "cpiHot" : "cpiCool", rng),
        });
        covered = true;
      }
      if (key === "payrolls" && (r.value < 0 || Math.abs(s) >= 75)) {
        const strong = r.value >= 0 && s > 0;
        const u = g.reported.unemployment.value;
        out.push({
          kind: "data", priority: 2, kicker: "Jobs report", art: strong ? "jobsStrong" : "jobsWeak", metric: "unemployment",
          headline:
            r.value < 0 ? `Economy loses ${Math.round(-r.value)}K jobs`
            : strong ? (r.value >= 200 ? `Hiring blowout: +${Math.round(r.value)}K jobs` : `Jobs beat forecasts: +${Math.round(r.value)}K`)
            : r.value < 75 ? `Hiring stalls: only +${Math.round(r.value)}K jobs` : `Jobs miss forecasts: +${Math.round(r.value)}K`,
          body: strong
            ? `Unemployment is ${f1(u)}%. A hot job market means rising wages — great for workers, but it keeps inflation sticky.`
            : `Unemployment is ${f1(u)}%. The labor market is cracking. Wait too long and layoffs can snowball into a recession.`,
          impacts: [{ label: "Payrolls", value: `${r.value >= 0 ? "+" : ""}${Math.round(r.value)}K`, tone: strong ? "good" : "bad" }, { label: "vs. forecast", value: `+${Math.round(r.consensus)}K`, tone: "neutral" }, ...impacts],
          voices: voices(strong ? "jobsStrong" : "jobsWeak", rng),
        });
        covered = true;
      }
      if (key === "gdp" && r.value < 0) {
        out.push({
          kind: "data", priority: 2, kicker: "Recession watch", art: "recession", metric: "gdp",
          headline: `GDP shrinks ${f1(-r.value)}%`,
          body: "The economy contracted this quarter. Unemployment usually follows. Cutting rates helps — but only with a lag of many months.",
          impacts: [{ label: "GDP", value: `${f1(r.value)}%`, tone: "bad" }, vsEst, ...impacts],
          voices: voices("recession", rng),
        });
        covered = true;
      }
    }

    if (ev.kind === "milestone") {
      const m: Record<string, Omit<Draft, "impacts" | "voices" | "kind" | "priority">> = {
        bearMarket: { kicker: "Market turmoil", headline: "BEAR MARKET: stocks down 20% from peak", art: "bearMarket", metric: "stockIndex", body: "Falling wealth makes households spend less and raises financial stress. Markets are begging for relief — but cutting with inflation high is risky." },
        correction: { kicker: "Markets", headline: "Stocks enter correction territory", art: "bearMarket", metric: "stockIndex", body: "The STX 500 is 10% off its high. Not a crisis yet, but sentiment is souring." },
        recordHigh: { kicker: "Markets", headline: "STX 500 hits a record high", art: "recordHigh", metric: "stockIndex", body: "Investors are euphoric. Rising wealth fuels spending — and possibly inflation." },
        mortgage7: { kicker: "Housing", headline: "Mortgage rates top 7%", art: "mortgage", metric: "mortgageRate", body: "Buying a home just got a lot more expensive. Housing will cool — that's part of how higher rates slow the economy." },
        mortgage8: { kicker: "Housing", headline: "Mortgage rates hit 8%", art: "mortgage", metric: "mortgageRate", body: "The housing market is freezing. Home prices may start falling." },
        yield5: { kicker: "Bond market", headline: "10-year yield breaks 5%", art: "yield5", metric: "yield10y", body: "Long-term borrowing costs are surging — tightening financial conditions even without you raising rates. QE can push them down." },
      };
      const d = m[ev.id];
      if (d) {
        out.push({ ...d, kind: "milestone", priority: 2, impacts, voices: voices(ev.id === "correction" ? "correction" : d.art === "mortgage" ? "mortgage" : d.art, rng) });
        covered = true;
      }
    }

    if (ev.kind === "close" && !covered && Math.abs(ev.stockPct) >= 3) {
      const up = ev.stockPct > 0;
      out.push({
        kind: "market", priority: 1, kicker: "Markets", art: up ? "recordHigh" : "bearMarket", metric: "stockIndex",
        headline: up ? `Stocks rocket ${f1(ev.stockPct)}% in a single day` : `Stocks plunge ${f1(-ev.stockPct)}% in a single day`,
        body: up ? "A massive relief rally. Traders are betting the worst is over." : "Panic selling across the board. Watch for financial stress spreading to banks and credit.",
        impacts, voices: voices(up ? "marketUp" : "marketDown", rng),
      });
    }

    if (ev.kind === "decision") {
      const r = ev.result;
      const yes = r.votes.filter((v) => v.yes).length;
      const move = r.passed ? r.proposal - r.previousRate : 0;
      const key = !r.passed ? "failed" : move > 0 ? "hike" : move < 0 ? "cut" : "hold";
      const bp = Math.round(Math.abs(move) * 100);
      const headline = !r.passed
        ? `FOMC rejects the Chair, ${yes}–${r.votes.length - yes}`
        : move === 0 ? `Fed holds at ${r.proposal.toFixed(2)}%` : `Fed ${move > 0 ? "hikes" : "cuts"} ${bp}bp to ${r.proposal.toFixed(2)}%`;
      const surprise = (r.passed ? r.proposal : r.previousRate) - r.marketExpected;
      const body = !r.passed
        ? "Your proposal failed. Rates stay put, and markets wonder who is really in charge. Credibility took a hit."
        : Math.abs(surprise) >= 0.2
          ? `Markets expected ${r.marketExpected.toFixed(2)}%. The ${surprise > 0 ? "hawkish" : "dovish"} surprise jolted stocks and bonds.`
          : `The decision was ${Math.abs(surprise) < 0.1 ? "fully" : "mostly"} priced in. Markets take it in stride.`;
      out.push({
        kind: "fomc", priority: 3, kicker: r.emergency ? "Emergency decision" : "FOMC decision", art: key, metric: "policyRate", headline, body,
        impacts: [
          { label: "Vote", value: `${yes}–${r.votes.length - yes}`, tone: r.passed ? "good" : "bad" },
          { label: "STX 500", value: signed(ev.stockPct, 1, "%"), tone: ev.stockPct >= 0 ? "good" : "bad" },
          { label: "10Y yield", value: `${signed(ev.yieldChg * 100, 0)}bp`, tone: "neutral" },
        ],
        voices: voices(key, rng, 1),
        rollCall: r.votes
          .map((v) => {
            const m = g.members.find((x) => x.id === v.memberId)!;
            return { name: m.role === "Chair" ? "You" : m.name, lean: m.hawkishness > 0.3 ? "hawk" : m.hawkishness < -0.3 ? "dove" : "center", yes: v.yes } as const;
          }),
      });
    }
  }

  // At most one market-driven popup per day; FOMC/shock always shown
  out.sort((a, b) => b.priority - a.priority);
  return out.slice(0, 2);
}

export function introAlert(g: GameState, rng: Rng): Draft {
  return {
    kind: "intro", priority: 3, kicker: "Sworn in", art: "intro", metric: "cpi",
    headline: "You are the new Chair of the Federal Reserve",
    body: `Inflation is ${f1(g.reported.cpi.value)}% — above the 2% target — and unemployment is ${f1(g.reported.unemployment.value)}%. Keep prices stable and people employed. Let inflation hit 10%, unemployment hit 11%, or lose the markets' trust, and you're out. Your first FOMC meeting starts now.`,
    impacts: [
      { label: "Core CPI", value: `${f1(g.reported.cpi.value)}%`, tone: "bad" },
      { label: "Unemployment", value: `${f1(g.reported.unemployment.value)}%`, tone: "good" },
      { label: "STX 500", value: `${Math.round(g.econ.stockIndex)}`, tone: "neutral" },
      { label: "From high", value: `${signed(-drawdown(g.econ) * 100, 1, "%")}`, tone: "neutral" },
    ],
    voices: voices("intro", rng),
  };
}
