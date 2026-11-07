import { ARGUMENTS } from "./arguments";
import { EVENT_BY_ID } from "./content/events";
import type { Rng } from "./rng";
import type { GameState, NewsItem, ReleaseKey, SimEvent } from "./types";

/**
 * Headline generator. Reads sim events and state only — it never affects the
 * simulation, so tone and wording can be rewritten freely.
 */
type Draft = Omit<NewsItem, "id" | "day">;

const pick = <T,>(rng: Rng, xs: T[]): T => xs[Math.floor(rng.next() * xs.length)];
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const bp = (x: number) => `${Math.round(Math.abs(x) * 100)}bp`;

const MILESTONE_NEWS: Record<string, Draft> = {
  mortgage7: { headline: "Mortgage rates top 7% for the first time in years", tone: "bad" },
  mortgage8: { headline: "Mortgage rates hit 8%; housing market freezes", tone: "bad" },
  mortgageBelow6: { headline: "Mortgage rates fall below 6%, sparking refi rush", tone: "good" },
  yield5: { headline: "10-year Treasury yield breaks 5%", tone: "bad" },
  correction: { headline: "STX 500 enters correction territory, down 10% from peak", tone: "bad" },
  bearMarket: { headline: "BEAR MARKET: STX 500 down 20% from its high", tone: "bad" },
  recordHigh: { headline: "STX 500 closes at a record high", tone: "good" },
};

const RELEASE_NAMES: Record<ReleaseKey, string> = {
  cpi: "inflation",
  unemployment: "jobs",
  payrolls: "jobs",
  gdp: "GDP",
  homePrice: "housing",
  claims: "jobless claims",
};

const RALLY_REASONS = [
  "as traders bet on rate cuts",
  "led by a tech rebound",
  "as bond yields ease",
  "on strong earnings",
  "in broad-based buying",
  "as short sellers scramble",
];
const SELLOFF_REASONS = [
  "as yields climb",
  "on rate-hike jitters",
  "led by bank shares",
  "as recession fears mount",
  "in a broad risk-off move",
  "as tech stocks tumble",
];

function releaseHeadline(key: ReleaseKey, ev: Extract<SimEvent, { kind: "release" }>, g: GameState): Draft | null {
  const { release: r, surprise: s } = ev;
  switch (key) {
    case "cpi": {
      const vs = s >= 0.1 ? "hotter than expected" : s <= -0.1 ? "cooler than expected" : "in line with forecasts";
      return { headline: `Core inflation ${r.value > r.prev ? "rises" : r.value < r.prev ? "eases" : "holds"} at ${f1(r.value)}%, ${vs}`, tone: s >= 0.1 && r.value > 2.5 ? "bad" : s <= -0.1 && r.value > 2 ? "good" : "neutral" };
    }
    case "payrolls": {
      const u = g.reported.unemployment.value;
      const verb = r.value >= 0 ? `adds ${Math.round(r.value)}K jobs` : `sheds ${Math.round(-r.value)}K jobs`;
      const vs = Math.abs(s) >= 40 ? `${s > 0 ? "beating" : "missing"} forecasts of ${Math.round(r.consensus)}K` : "roughly as expected";
      return { headline: `Economy ${verb}, ${vs}; unemployment ${f1(u)}%`, tone: r.value < 0 ? "bad" : s > 40 ? "good" : "neutral" };
    }
    case "gdp":
      return r.value < 0
        ? { headline: `GDP shrinks ${f1(-r.value)}% annualized — recession talk grows`, tone: "bad" }
        : { headline: `GDP grows ${f1(r.value)}% annualized${s > 0.3 ? ", topping estimates" : s < -0.3 ? ", short of estimates" : ""}`, tone: r.value > 1.5 ? "good" : "neutral" };
    case "homePrice": {
      const h = g.history;
      const yearAgo = h[Math.max(0, h.length - 261)]?.homePrice ?? r.value;
      const yoy = (r.value / yearAgo - 1) * 100;
      return { headline: `Home prices ${yoy >= 0 ? "up" : "down"} ${f1(Math.abs(yoy))}% from a year ago`, tone: yoy < -3 ? "bad" : "neutral" };
    }
    case "claims":
      if (r.value >= 260 || Math.abs(s) >= 15)
        return { headline: `Jobless claims ${s > 0 ? "jump" : "drop"} to ${Math.round(r.value)}K`, tone: s > 0 ? "bad" : "good" };
      return null;
    case "unemployment":
      return null; // folded into the payrolls headline
  }
}

export function newsFor(events: SimEvent[], g: GameState, rng: Rng): Draft[] {
  const out: Draft[] = [];
  const releases = events.filter((e): e is Extract<SimEvent, { kind: "release" }> => e.kind === "release");
  const hadShock = events.some((e) => e.kind === "shock");

  for (const ev of events) {
    switch (ev.kind) {
      case "release": {
        const d = releaseHeadline(ev.key, ev, g);
        if (d) out.push(d);
        break;
      }
      case "shock": {
        const d = EVENT_BY_ID[ev.id];
        if (d) out.push({ headline: pick(rng, d.headlines)(ev.params), tone: d.tone });
        break;
      }
      case "milestone":
        if (MILESTONE_NEWS[ev.id]) out.push(MILESTONE_NEWS[ev.id]);
        break;
      case "close": {
        if (Math.abs(ev.stockPct) < 1.5 || hadShock) break;
        const up = ev.stockPct > 0;
        const reason = releases.length
          ? `after ${RELEASE_NAMES[releases[0].key]} data`
          : pick(rng, up ? RALLY_REASONS : SELLOFF_REASONS);
        out.push({ headline: `Stocks ${up ? "surge" : "slide"} ${f1(Math.abs(ev.stockPct))}% ${reason}`, tone: up ? "good" : "bad" });
        break;
      }
      case "meetingStart":
        out.push(
          ev.emergency
            ? { headline: "BREAKING: Fed calls unscheduled emergency meeting", tone: "bad" }
            : { headline: `FOMC convenes; markets price ${f2(g.marketExpected)}% ${impliedMove(g)}`, tone: "neutral" },
        );
        break;
      case "decision": {
        const r = ev.result;
        const move = r.proposal - r.previousRate;
        const dissents = r.votes.filter((v) => !v.yes).length;
        const tag = r.emergency ? "In emergency move, " : "";
        if (!r.passed) {
          out.push({ headline: `${tag}FOMC rejects Chair's proposal ${r.votes.filter((v) => v.yes).length}–${dissents}; rates stuck at ${f2(r.previousRate)}%`, tone: "bad" });
        } else if (move === 0) {
          out.push({ headline: `Fed holds rates at ${f2(r.proposal)}%${dissents ? ` (${dissents} dissent${dissents > 1 ? "s" : ""})` : ""}`, tone: "neutral" });
        } else {
          out.push({ headline: `${tag}Fed ${move > 0 ? "hikes" : "cuts"} ${bp(move)} to ${f2(r.proposal)}%${dissents >= 3 ? `; ${dissents} dissents expose rifts` : ""}`, tone: "neutral" });
        }
        const actual = r.passed ? r.proposal : r.previousRate;
        const surprise = actual - r.marketExpected;
        if (Math.abs(surprise) >= 0.2)
          out.push({ headline: surprise > 0 ? "Hawkish surprise blindsides Wall Street" : "Dovish surprise sends traders scrambling", tone: "bad" });
        if (ev.reversal) out.push({ headline: "Fed reverses course weeks after signaling the opposite", tone: "bad" });
        for (const a of r.arguments) {
          const def = ARGUMENTS.find((x) => x.id === a.id);
          if (def && a.evidence < -0.3)
            out.push({ headline: `Minutes: Chair's claim "${def.label.toLowerCase()}" met with skepticism`, tone: "bad" });
        }
        break;
      }
      case "action":
        if (ev.id === "hawkishSpeech") out.push({ headline: "Chair signals more tightening may be needed", tone: "neutral" });
        if (ev.id === "dovishSpeech") out.push({ headline: "Chair hints at easing: 'We are watching the labor market closely'", tone: "neutral" });
        if (ev.id === "lendingFacility") out.push({ headline: "Fed opens emergency lending facility to stem bank panic", tone: "neutral" });
        break;
      case "qe":
        out.push(
          ev.pace === 1
            ? { headline: "Fed restarts bond purchases (QE)", tone: "neutral" }
            : ev.pace === -1
              ? { headline: "Fed to shrink balance sheet faster (QT)", tone: "neutral" }
              : { headline: "Fed freezes balance sheet at current size", tone: "neutral" },
        );
        break;
    }
  }
  return out;
}

export function impliedMove(g: GameState): string {
  const d = g.marketExpected - g.econ.policyRate;
  if (Math.abs(d) < 0.05) return "(hold)";
  return `(${d > 0 ? "+" : "−"}${Math.round(Math.abs(d) * 100)}bp)`;
}
