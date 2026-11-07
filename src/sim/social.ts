import { ARGUMENTS } from "./arguments";
import { ACCOUNTS, type Persona } from "./content/accounts";
import { AMBIENT, type ChatCtx, type Fill } from "./content/chatter";
import { EVENT_BY_ID, resolve } from "./content/events";
import { drawdown } from "./economy";
import type { Rng } from "./rng";
import type { GameState, Post, SimEvent } from "./types";

/**
 * The never-ending social feed. Pure flavor: reads state, never affects the sim.
 * All accounts are fictional. Background chatter lives in content/chatter.ts,
 * world-event posts in content/events.ts; this file handles reactions + assembly.
 */
type Draft = Omit<Post, "id" | "day">;

/** Reaction templates can also look at the full game state. */
type Ctx = ChatCtx & { g: GameState };
interface RTpl {
  p: Persona;
  text: (c: Ctx, r: Fill) => string;
}

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);

// ---------------------------------------------------------------- reactions

function reactions(ev: SimEvent, c: Ctx): RTpl[] {
  switch (ev.kind) {
    case "release": {
      const { key, release: r, surprise: s } = ev;
      if (key === "cpi") {
        if (s >= 0.1) return [
          { p: "news", text: () => `🚨 CPI HOT: ${f1(r.value)}% vs ${f1(r.consensus)}% expected` },
          { p: "bro", text: () => "hot CPI. my portfolio is on fire and not the good kind" },
          { p: "economist", text: () => `Another hot print (${f1(r.value)}%). The Fed has some explaining to do.` },
          { p: "genz", text: () => "inflation report came out hot. like me. but worse for the economy" },
          { p: "meme", text: () => "CPI: hotter than expected\nFed Chair: 😐\nMarkets: 😱\nMe at the grocery store: 💀" },
          { p: "politician", text: () => `Inflation at ${f1(r.value)}%. How much longer will families suffer?` },
        ];
        if (s <= -0.1) return [
          { p: "news", text: () => `CPI cooler than expected: ${f1(r.value)}% vs ${f1(r.consensus)}% est.` },
          { p: "bro", text: () => "COOL CPI = RATE CUTS = 🚀" },
          { p: "economist", text: () => "Encouraging inflation print. One month isn't a trend, but this is the direction we want." },
          { p: "homebuyer", text: () => "cool inflation = lower rates = maybe a house?? manifesting 🏡🙏" },
          { p: "crypto", text: () => "soft CPI. liquidity incoming. you know what that means ₿🚀" },
        ];
        return [{ p: "news", text: () => `CPI ${f1(r.value)}%, in line with estimates.` }];
      }
      if (key === "payrolls") {
        const u = c.g.reported.unemployment.value;
        if (r.value < 0) return [
          { p: "news", text: () => `🚨 Payrolls: ${Math.round(r.value)}K. Economy LOST jobs. Unemployment ${f1(u)}%` },
          { p: "doomer", text: () => "negative payrolls. recession confirmed. you heard it here first" },
          { p: "regular", text: () => "my whole team got laid off on a zoom call. 4 minutes. didn't even turn on their camera" },
        ];
        if (s >= 50) return [
          { p: "news", text: () => `Blowout jobs report: +${Math.round(r.value)}K vs +${Math.round(r.consensus)}K est.` },
          { p: "bro", text: () => c.cpi > 3 ? "strong jobs report and stocks DOWN?? good news is bad news i hate this market" : "economy is BOOMING 💪" },
          { p: "economist", text: () => "Labor market keeps defying gravity." },
          { p: "genz", text: () => "strong jobs report and i still can't get a callback. who are they hiring. show me" },
        ];
        if (s <= -50) return [
          { p: "news", text: () => `Jobs miss: +${Math.round(r.value)}K vs +${Math.round(r.consensus)}K est. Unemployment ${f1(u)}%` },
          { p: "economist", text: () => "Weak payrolls. Cracks forming in the labor market?" },
        ];
        return [{ p: "news", text: () => `Payrolls +${Math.round(r.value)}K, unemployment ${f1(u)}%` }];
      }
      if (key === "gdp") return r.value < 0
        ? [{ p: "doomer", text: () => "negative GDP. told you." }, { p: "politician", text: () => "The economy is shrinking on this Fed's watch. Unacceptable." }]
        : [{ p: "news", text: () => `GDP ${f1(r.value)}% annualized (est. ${f1(r.consensus)}%)` }];
      if (key === "claims" && r.value >= 260) return [{ p: "economist", text: () => `Initial claims ${Math.round(r.value)}K. That's recession territory if it keeps up.` }];
      return [];
    }
    case "shock":
      return (EVENT_BY_ID[ev.id]?.posts ?? []).map((x) => ({ p: x.p, text: () => resolve(x.text, ev.params) }));
    case "milestone":
      if (ev.id === "bearMarket") return [{ p: "bro", text: () => "bear market?? i've literally never seen one. what do i do" }, { p: "doomer", text: () => "BEAR MARKET. welcome to the real world kids" }];
      if (ev.id === "recordHigh") return [{ p: "bro", text: () => "ALL TIME HIGHS BABY 🎉🚀📈" }];
      if (ev.id === "mortgage7") return [{ p: "homebuyer", text: () => "7% mortgage rates. the dream is dead. long live the dream" }];
      if (ev.id === "mortgage8") return [{ p: "homebuyer", text: () => "8%. EIGHT. my monthly payment would be more than my salary" }];
      return [];
    case "meetingStart":
      return ev.emergency
        ? [{ p: "news", text: () => "🚨🚨 FED CALLS EMERGENCY MEETING 🚨🚨" }, { p: "doomer", text: () => "EMERGENCY meeting? what do they know that we don't" }, { p: "bro", text: () => "emergency meeting = emergency cut?? 👀" }]
        : [{ p: "economist", text: () => `FOMC day. Markets pricing ${f2(c.g.marketExpected)}%. Let's see if the Chair delivers.` }];
    case "decision": {
      const r = ev.result;
      const move = r.passed ? r.proposal - r.previousRate : 0;
      const out: RTpl[] = [];
      if (!r.passed) out.push(
        { p: "news", text: () => "WOW: FOMC votes DOWN the Chair's proposal. Extremely rare." },
        { p: "economist", text: () => "A Chair losing an FOMC vote is a genuine institutional crisis. Credibility hit incoming." },
        { p: "bro", text: () => "the Fed is in civil war and i'm here for it 🍿" },
      );
      else if (move > 0) out.push(
        { p: "regular", text: () => "another hike?? my credit card APR is already 27%" },
        { p: "bro", text: () => "Fed trying to kill the rally smh" },
        { p: "economist", text: () => c.cpi > 3 ? `Right call. Inflation at ${f1(c.cpi)}% needs restrictive policy.` : `Hiking with inflation at ${f1(c.cpi)}%? Seems like overkill.` },
        { p: "retiree", text: () => "Higher rates! My CD thanks you, Madam/Mister Chair." },
        { p: "student", text: () => "another hike. my student loan servicer just did a little dance" },
        { p: "business", text: () => "Every hike makes our equipment loan more expensive. We'll survive. Probably." },
        { p: "meme", text: (_c, r) => `Fed: *hikes ${r.pick(["25", "another 25", "rates again"])}*\nMy credit card: 📈\nMy paycheck: 🗿` },
      );
      else if (move < 0) out.push(
        { p: "bro", text: () => "RATE CUT 🚀🚀🚀 LFG" },
        { p: "doomer", text: () => "they're cutting because they know something we don't" },
        { p: "economist", text: () => c.cpi > 3 ? `Cutting with inflation at ${f1(c.cpi)}%? Bold. Possibly reckless.` : "Sensible cut given the slowdown." },
        { p: "homebuyer", text: () => "rate cut!! does this mean mortgages go down?? (please say yes)" },
        { p: "landlord", text: () => "rate cut = refinancing all 6 properties. good day to be me" },
        { p: "crypto", text: () => "CUTS. liquidity. number go up. ₿" },
      );
      else out.push(
        { p: "news", text: () => `Fed holds at ${f2(r.proposal)}%.` },
        { p: "regular", text: () => "fed did nothing today. same tbh" },
        { p: "meme", text: () => "Fed holds rates.\nTraders who bet on a move: 🧍" },
        { p: "economist", text: () => "Hold was the right call. Let the lags work." },
      );
      const surprise = (r.passed ? r.proposal : r.previousRate) - r.marketExpected;
      if (Math.abs(surprise) >= 0.2) out.push({ p: "bro", text: () => "NOBODY had that on their bingo card. my puts/calls are toast" });
      if (ev.reversal) out.push({ p: "economist", text: () => "Six weeks ago the Chair said the opposite. Forward guidance means nothing now." });
      for (const a of r.arguments) {
        const def = ARGUMENTS.find((x) => x.id === a.id);
        if (def && a.evidence < -0.3) out.push({ p: "economist", text: () => `Chair reportedly argued "${def.label.toLowerCase()}". Has anyone shown them the data? 📉📈` });
        else if (def && a.evidence > 0.6) out.push({ p: "economist", text: () => `Chair made a data-driven case: "${def.label.toLowerCase()}". Hard to argue with.` });
      }
      return out;
    }
    case "action":
      if (ev.id === "hawkishSpeech") return [{ p: "news", text: () => "Chair: 'We will do what it takes to restore price stability.' Yields jump." }, { p: "bro", text: () => "why does the Chair keep talking. stop talking. please" }];
      if (ev.id === "dovishSpeech") return [{ p: "news", text: () => "Chair: 'We are mindful of risks to employment.' Stocks pop." }, { p: "bro", text: () => "Chair said the magic words 🪄🚀" }];
      if (ev.id === "lendingFacility") return [{ p: "regular", text: () => "so the banks get a bailout and i get... a 27% credit card. cool cool" }, { p: "economist", text: () => "Right move. Stopping a bank run early is far cheaper than a crisis." }, { p: "politician", text: () => "Another Wall Street bailout. Main Street pays the price." }];
      return [];
    case "qe":
      if (ev.pace === 1) return [{ p: "crypto", text: () => "QE IS BACK. bitcoin to the moon. fiat to zero" }, { p: "economist", text: () => "QE will push down long rates and term premia. Mortgage rates should follow." }];
      if (ev.pace === -1) return [{ p: "economist", text: () => "QT running in the background. Watch the 10-year." }];
      return [];
    case "close":
      return [];
  }
}

// ---------------------------------------------------------------- assembly

function ctxOf(g: GameState, events: SimEvent[]): Ctx {
  const close = events.find((e): e is Extract<SimEvent, { kind: "close" }> => e.kind === "close");
  const h = g.history;
  return {
    g,
    qe: g.econ.qePace,
    priced: g.marketExpected,
    homeYoY: (g.reported.homePrice.value / h[Math.max(0, h.length - 261)].homePrice - 1) * 100,
    payrolls: g.reported.payrolls.value,
    cpi: g.reported.cpi.value,
    u: g.reported.unemployment.value,
    rate: g.econ.policyRate,
    y10: g.econ.yield10y,
    mortgage: g.econ.mortgageRate,
    stock: g.econ.stockIndex,
    // Today's move so far (vs. the previous close)
    dayPct: close?.stockPct ?? (g.econ.stockIndex / g.prevClose.stock - 1) * 100,
    dd: drawdown(g.econ),
    cred: g.econ.credibility,
    stress: g.econ.financialStress,
    gdp: g.reported.gdp.value,
  };
}

function filler(rng: Rng): Fill {
  return {
    pick: (xs) => xs[Math.floor(rng.next() * xs.length)],
    int: (lo, hi) => lo + Math.floor(rng.next() * (hi - lo + 1)),
    num: (lo, hi) => lo + rng.next() * (hi - lo),
  };
}

function render(t: RTpl, c: Ctx, rng: Rng, hype: number): Draft {
  const acct = ACCOUNTS[t.p][Math.floor(rng.next() * ACCOUNTS[t.p].length)];
  const base = t.p === "news" ? 800 : t.p === "politician" ? 1500 : t.p === "economist" ? 300 : t.p === "meme" ? 2500 : 40;
  const viral = rng.next() < 0.06 ? 20 : 1;
  const likes = Math.round(base * hype * viral * Math.exp(rng.normal() * 0.9));
  return { name: acct.name, handle: acct.handle, persona: t.p, text: t.text(c, filler(rng)), likes, reposts: Math.round(likes * (0.05 + rng.next() * 0.2)) };
}

/** Render ready-made posts (e.g. from the color generator) as feed items. */
export function postsFromText(items: { p: Persona; text: string }[], g: GameState, rng: Rng): Draft[] {
  const c = ctxOf(g, []);
  return items.map((x) => render({ p: x.p, text: () => x.text }, c, rng, 1.5));
}

/** `ambient` = expected number of background posts for this call (≈1.9 per trading day). */
export function postsFor(events: SimEvent[], g: GameState, rng: Rng, ambient = 0): Draft[] {
  const c = ctxOf(g, events);
  const out: Draft[] = [];
  // Compare ignoring numbers, so "tip #44" and "tip #52" count as repeats
  const shape = (t: string) => t.replace(/[\d.,]+/g, "#");
  const recent = new Set(g.posts.slice(0, 40).map((p) => shape(p.text)));

  // Reactions to what just happened (2 per notable event)
  for (const ev of events) {
    const pool = reactions(ev, c).slice();
    for (let i = 0; i < 2 && pool.length; i++) {
      const t = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
      out.push(render(t, c, rng, 3));
    }
  }

  // Ambient chatter: a few posts every day
  const eligible = AMBIENT.filter((t) => !t.when || t.when(c));
  let n = 0;
  for (let i = 0; i < 3; i++) if (rng.next() < ambient / 3) n++;
  for (let i = 0; i < n && eligible.length; i++) {
    const t = eligible.splice(Math.floor(rng.next() * eligible.length), 1)[0];
    const d = render(t, c, rng, 1);
    if (!recent.has(shape(d.text))) out.push(d);
  }
  return out;
}
