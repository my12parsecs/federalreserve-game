import { drawdown } from "./economy";
import { preferredRate, type PolicyView } from "./fomc";
import type { GameState, Member, Topic } from "./types";

/**
 * Arguments the Chair can make in the FOMC meeting. Each one is only as
 * persuasive as the data behind it: if the data contradicts the claim,
 * it backfires and pushes members the other way.
 */
export interface EvidenceCtx {
  cpi: number;
  cpiChange3m: number;
  unemployment: number;
  uStar: number;
  payrolls: number;
  claims: number;
  gdp: number;
  inflationExp: number;
  stock1y: number; // fractional 1-year stock return
  drawdown: number; // fraction below all-time high
  homeYoY: number; // fractional
  mortgage: number;
  stress: number;
}

export interface ArgumentDef {
  id: string;
  label: string;
  stance: 1 | -1; // 1 = argues for higher rates, −1 = lower
  topic: Topic;
  evidence: (c: EvidenceCtx) => number; // unclamped; >0 supports, <0 contradicts
}

const c1 = (x: number) => Math.max(-1, Math.min(1, x));

export const ARGUMENTS: ArgumentDef[] = [
  // Hawkish
  { id: "hotInflation", label: "Inflation is still too hot", stance: 1, topic: "inflation",
    evidence: (c) => (c.cpi - 2.5) / 1.0 + c.cpiChange3m / 0.5 * 0.3 },
  { id: "tightLabor", label: "The labor market is overheating", stance: 1, topic: "labor",
    evidence: (c) => (c.uStar - c.unemployment) / 0.6 + (c.payrolls - 150) / 300 },
  { id: "expectations", label: "Inflation expectations are drifting up", stance: 1, topic: "expectations",
    evidence: (c) => (c.inflationExp - 2.3) / 0.4 },
  { id: "froth", label: "Asset markets are getting frothy", stance: 1, topic: "markets",
    evidence: (c) => (c.stock1y - 0.12) / 0.12 },
  { id: "strongGrowth", label: "Growth is running above trend", stance: 1, topic: "growth",
    evidence: (c) => (c.gdp - 2.2) / 1.0 },
  // Dovish
  { id: "coolingInflation", label: "Inflation is cooling", stance: -1, topic: "inflation",
    evidence: (c) => (2.7 - c.cpi) / 0.8 - c.cpiChange3m / 0.4 },
  { id: "jobLosses", label: "Layoffs are spreading", stance: -1, topic: "labor",
    evidence: (c) => (c.unemployment - c.uStar - 0.2) / 0.6 + (c.claims - 240) / 40 },
  { id: "slowdown", label: "Growth is stalling", stance: -1, topic: "growth",
    evidence: (c) => (1.2 - c.gdp) / 1.0 },
  { id: "financial", label: "Financial conditions are too tight", stance: -1, topic: "financial",
    evidence: (c) => c.stress * 1.5 + (c.drawdown - 0.1) / 0.1 + (c.mortgage - 7.5) / 1.0 },
  { id: "housing", label: "The housing market is cracking", stance: -1, topic: "housing",
    evidence: (c) => -c.homeYoY / 0.04 },
];

export const MAX_ARGUMENTS = 2;
/** Max rate shift (pp) a single fully-supported argument can move a fully-receptive member. */
const ARGUMENT_POWER = 0.4;

export function evidenceContext(g: GameState): EvidenceCtx {
  const h = g.history;
  const ago = (days: number) => h[Math.max(0, h.length - 1 - days)];
  const now = h[h.length - 1];
  return {
    cpi: g.reported.cpi.value,
    cpiChange3m: now.cpi - ago(63).cpi,
    unemployment: g.reported.unemployment.value,
    uStar: g.econ.naturalUnemployment,
    payrolls: g.reported.payrolls.value,
    claims: g.reported.claims.value,
    gdp: g.reported.gdp.value,
    inflationExp: now.inflationExp,
    stock1y: now.stockIndex / ago(260).stockIndex - 1,
    drawdown: drawdown(g.econ),
    homeYoY: now.homePrice / ago(260).homePrice - 1,
    mortgage: g.econ.mortgageRate,
    stress: g.econ.financialStress,
  };
}

export function argumentEvidence(id: string, ctx: EvidenceCtx): number {
  const def = ARGUMENTS.find((a) => a.id === id);
  return def ? c1(def.evidence(ctx)) : 0;
}

/** Hawks are more receptive to hawkish arguments, doves to dovish ones. */
function receptivity(member: Member, arg: ArgumentDef): number {
  const base = member.focus[arg.topic] ?? 0.5;
  return base * (1 + 0.5 * member.hawkishness * arg.stance);
}

/**
 * How far each member's preferred rate moves given the Chair's arguments.
 *  - A supported argument pulls a member *toward the proposal* (never past it),
 *    but only if it points the way they need to move.
 *  - An argument the data contradicts backfires: it pushes members the opposite way.
 */
export function argumentShifts(
  members: Member[],
  argIds: string[],
  ctx: EvidenceCtx,
  view: PolicyView,
  proposal: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const member of members) {
    const gap = proposal - preferredRate(member, view);
    let pull = 0;
    let backfire = 0;
    for (const id of argIds.slice(0, MAX_ARGUMENTS)) {
      const arg = ARGUMENTS.find((a) => a.id === id);
      if (!arg) continue;
      const evidence = argumentEvidence(id, ctx);
      const mag = Math.abs(evidence) * receptivity(member, arg) * ARGUMENT_POWER;
      if (evidence < 0) backfire -= arg.stance * mag;
      else if (Math.sign(gap) === arg.stance) pull += mag;
    }
    out[member.id] = Math.sign(gap) * Math.min(pull, Math.abs(gap)) + backfire;
  }
  return out;
}
