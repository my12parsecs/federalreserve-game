import { P } from "./config";
import type { Member, Topic, Vote } from "./types";

export const roundQuarter = (x: number) => Math.round(x * 4) / 4;

/** What the committee can see: reported data, not the true economy. */
export interface PolicyView {
  policyRate: number;
  inflation: number; // latest reported core CPI
  gapEst: number; // output gap estimated from reported unemployment
}

/**
 * The 12 voting members (fictional). The player is the Chair (index 0).
 * `focus` = which arguments they're receptive to (default 0.5).
 */
export function defaultCommittee(): Member[] {
  const m = (
    id: string,
    name: string,
    role: Member["role"],
    hawkishness: number,
    rStarView: number,
    maxMove: number,
    tolerance: number,
    focus: Partial<Record<Topic, number>>,
    district?: string,
  ): Member => ({ id, name, role, district, hawkishness, rStarView, maxMove, tolerance, focus });

  return [
    m("chair", "You", "Chair", 0, 0.75, 1, 99, {}),
    m("vc", "Elena Marsh", "Governor", -0.2, 0.75, 0.5, 0.5, { labor: 0.8, financial: 0.7 }),
    m("g1", "Raymond Holt", "Governor", 0.6, 1.0, 0.5, 0.5, { expectations: 0.9, markets: 0.2 }),
    m("g2", "Priya Anand", "Governor", -0.6, 0.5, 0.5, 0.5, { labor: 0.9, housing: 0.7 }),
    m("g3", "Thomas Kerr", "Governor", 0.2, 0.75, 0.25, 0.5, { financial: 0.9, markets: 0.8 }),
    m("g4", "Lucia Ferreira", "Governor", -0.3, 0.5, 0.5, 0.5, { growth: 0.8, housing: 0.8 }),
    m("g5", "Daniel Osei", "Governor", 0.4, 1.0, 0.5, 0.5, { inflation: 0.8, growth: 0.3 }),
    m("ny", "Margaret Lin", "President", 0.0, 0.75, 0.5, 0.5, { markets: 0.9, financial: 0.9 }, "New York"),
    m("p1", "Walter Brandt", "President", 0.9, 1.25, 0.75, 0.25, { inflation: 0.9, expectations: 0.9, labor: 0.2 }, "Kansas City"),
    m("p2", "Sofia Reyes", "President", -0.8, 0.25, 0.75, 0.25, { labor: 1.0, inflation: 0.3 }, "Minneapolis"),
    m("p3", "Gregory Pike", "President", 0.5, 1.0, 0.5, 0.5, { growth: 0.8, markets: 0.6 }, "Dallas"),
    m("p4", "Aisha Coleman", "President", -0.4, 0.5, 0.5, 0.5, { housing: 0.9, labor: 0.7 }, "Chicago"),
  ];
}

/**
 * Each member runs their own Taylor rule — hawks weight inflation more,
 * doves weight the output gap more — then limits the step size.
 */
export function preferredRate(member: Member, v: PolicyView): number {
  const wPi = 0.5 + 0.5 * member.hawkishness;
  const wY = 0.5 - 0.35 * member.hawkishness;
  const taylor =
    member.rStarView + v.inflation + wPi * (v.inflation - P.inflationTarget) + wY * v.gapEst;
  const step = Math.max(-member.maxMove, Math.min(member.maxMove, taylor - v.policyRate));
  return Math.max(0, roundQuarter(v.policyRate + step));
}

export function castVotes(
  members: Member[],
  view: PolicyView,
  proposal: number,
  shifts: Record<string, number> = {},
): Vote[] {
  return members.map((member) => {
    const preferred = preferredRate(member, view);
    const persuaded = preferred + (shifts[member.id] ?? 0);
    const yes = member.role === "Chair" || Math.abs(proposal - persuaded) <= member.tolerance + 1e-9;
    return { memberId: member.id, preferred, persuaded, yes };
  });
}

/** Markets read Fed-speak: they price the committee's median preference. */
export function committeeMedian(members: Member[], view: PolicyView): number {
  const prefs = members
    .filter((m) => m.role !== "Chair")
    .map((m) => preferredRate(m, view))
    .sort((a, b) => a - b);
  const mid = prefs.length / 2;
  return roundQuarter((prefs[Math.floor(mid - 0.5)] + prefs[Math.ceil(mid - 0.5)]) / 2);
}

export const MAJORITY = 7;
