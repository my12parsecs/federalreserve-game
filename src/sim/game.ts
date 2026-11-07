import { alertsFor, introAlert } from "./alerts";
import { argumentEvidence, argumentShifts, evidenceContext, MAX_ARGUMENTS } from "./arguments";
import { CYCLE_DAYS, P, initialEconomy } from "./config";
import { HOURS_PER_DAY, applyMarketJump, applyPolicySurprise, clamp, drawdown, housingConstant, stepMacro, stepMarkets } from "./economy";
import { MAJORITY, castVotes, committeeMedian, defaultCommittee, type PolicyView } from "./fomc";
import { newsFor } from "./news";
import { initialReported, makeRelease, marketReaction, scheduledReleases } from "./releases";
import { createRng, type Rng } from "./rng";
import { rollFns, rollShock } from "./shocks";
import { postsFor, postsFromText } from "./social";
import { holdings, newWallet, walletMark, walletOpen } from "./wallet";
import { colorFor } from "./content/color";
import type { ActionId, Alert, GameState, MeetingResult, QePace, SimEvent, Snapshot } from "./types";

/** Calibrated once from the opening scenario (housing fair value anchor). */
const HOUSING_K = housingConstant(initialEconomy());
/** Days of history generated before the player's first meeting. */
const WARMUP_DAYS = 260;
const HISTORY_CAP = 260 * 5;
/** Hourly points kept for charts (~4 weeks). */
const INTRADAY_CAP = HOURS_PER_DAY * 20;
/** Same milestone (e.g. "correction") at most every ~6 months. */
const MILESTONE_REPEAT_DAYS = 130;
/** Same kind of data/market popup at most every ~2 cycles. */
const ALERT_REPEAT_DAYS = 65;

// ---------------------------------------------------------------- helpers

export function policyView(g: GameState): PolicyView {
  return {
    policyRate: g.econ.policyRate,
    inflation: g.reported.cpi.value,
    gapEst: (g.econ.naturalUnemployment - g.reported.unemployment.value) / P.okun,
  };
}

function snapshot(g: GameState): Snapshot {
  const e = g.econ;
  return {
    day: e.day - 1 + g.hour / HOURS_PER_DAY,
    policyRate: e.policyRate,
    cpi: g.reported.cpi.value,
    inflationExp: e.inflationExp,
    unemployment: g.reported.unemployment.value,
    claims: g.reported.claims.value,
    gdp: g.reported.gdp.value,
    yield10y: e.yield10y,
    mortgageRate: e.mortgageRate,
    stockIndex: e.stockIndex,
    homePrice: g.reported.homePrice.value,
    netWorth: holdings(g.wallet, e, g.reported.homePrice.value).total,
  };
}

/**
 * Shallow-copy everything a turn mutates, so states stay immutable to the UI.
 * Arrays (history, intraday, feeds) are replaced, never mutated, where they change.
 */
function draft(prev: GameState): GameState {
  return {
    ...prev,
    econ: { ...prev.econ },
    reported: { ...prev.reported },
    wallet: { ...prev.wallet },
    cooldowns: { ...prev.cooldowns },
  };
}

const appendCapped = <T,>(xs: T[], x: T, cap: number): T[] => (xs.length >= cap ? [...xs.slice(1 - cap), x] : [...xs, x]);

function rngs(g: GameState): { rng: Rng; frng: Rng } {
  const rng = createRng(0);
  rng.state = g.rngState;
  const frng = createRng(0);
  frng.state = g.flavorRngState;
  return { rng, frng };
}

function saveRngs(g: GameState, rng: Rng, frng: Rng) {
  g.rngState = rng.state;
  g.flavorRngState = frng.state;
}

/** Turn sim events into headlines and social posts (flavor only — never touches the sim). */
/** Background social posts per trading day. */
const AMBIENT_POSTS_PER_DAY = 1.9;

function narrate(g: GameState, events: SimEvent[], frng: Rng, ambient = 0) {
  // Background color (Fed-speak, earnings, previews) only rides along with hourly ticks
  const color = ambient > 0 ? colorFor(g, frng, HOURS_PER_DAY) : { news: [], posts: [] };
  const news = [...newsFor(events, g, frng), ...color.news].map((n) => ({ ...n, id: g.nextId++, day: g.econ.day }));
  const posts = [...postsFor(events, g, frng, ambient), ...postsFromText(color.posts, g, frng)].map((p) => ({ ...p, id: g.nextId++, day: g.econ.day }));
  if (news.length) g.news = [...news.reverse(), ...g.news].slice(0, 80);
  if (posts.length) g.posts = [...posts.reverse(), ...g.posts].slice(0, 120);
  const alerts = alertsFor(events, g, frng)
    .filter((a) => {
      // Shocks and FOMC decisions always pop; recurring data/market popups at most every 2 cycles
      if (a.kind === "shock" || a.kind === "fomc") return true;
      const key = `alert:${a.art}`;
      if (g.econ.day - (g.lastFired[key] ?? -Infinity) < ALERT_REPEAT_DAYS) return false;
      g.lastFired = { ...g.lastFired, [key]: g.econ.day };
      return true;
    })
    .map((a) => ({ ...a, id: g.nextId++, day: g.econ.day }));
  if (alerts.length) g.alerts = [...g.alerts, ...alerts].slice(-3);
}

function updateMarketExpected(g: GameState) {
  g.marketExpected = Math.max(0, committeeMedian(g.members, policyView(g)) + g.econ.guidance);
}

// ---------------------------------------------------------------- hourly tick

const MILESTONES: { id: string; test: (g: GameState, b: GameState["prevClose"]) => boolean }[] = [
  { id: "mortgage7", test: (g, b) => g.econ.mortgageRate >= 7 && b.mortgage < 7 },
  { id: "mortgage8", test: (g, b) => g.econ.mortgageRate >= 8 && b.mortgage < 8 },
  { id: "mortgageBelow6", test: (g, b) => g.econ.mortgageRate < 6 && b.mortgage >= 6 },
  { id: "yield5", test: (g, b) => g.econ.yield10y >= 5 && b.y10 < 5 },
  { id: "correction", test: (g, b) => drawdown(g.econ) >= 0.1 && b.drawdown < 0.1 },
  { id: "bearMarket", test: (g, b) => drawdown(g.econ) >= 0.2 && b.drawdown < 0.2 },
  { id: "recordHigh", test: (g, b) => b.drawdown > 0.05 && drawdown(g.econ) === 0 },
];

/**
 * One trading hour. At the open the real economy takes its daily step and
 * scheduled data drops (8:30am releases hit at the open). Every hour markets move
 * and random events may strike. At the close the day is recorded.
 * Returns true if this tick was the close.
 */
function tick(g: GameState, rng: Rng, frng: Rng | null): boolean {
  const e = g.econ;
  const events: SimEvent[] = [];

  if (g.hour === 0) {
    // Yesterday's close becomes the reference for today's moves
    g.prevClose = { stock: e.stockIndex, y10: e.yield10y, mortgage: e.mortgageRate, drawdown: drawdown(e) };
    updateMarketExpected(g);
    stepMacro(e, rng, HOUSING_K);
    walletOpen(g.wallet, e, g.reported.cpi.value);
    for (const key of scheduledReleases(e.day)) {
      const release = makeRelease(key, e, g.reported[key], e.day, rng);
      g.reported[key] = release;
      if (key === "payrolls") e.lastJobsU = e.unemployment;
      const surprise = release.value - release.consensus;
      const r = marketReaction(key, surprise, g.reported.cpi.value);
      applyMarketJump(e, r.stockPct, r.yieldChg);
      events.push({ kind: "release", key, release, surprise });
    }
    // New data moves the committee's expected path
    updateMarketExpected(g);
  }

  stepMarkets(e, rng, g.marketExpected, 1 / HOURS_PER_DAY);
  const shock = rollShock(rng, e, HOURS_PER_DAY);
  if (shock) {
    // Each occurrence rolls its own size, which sets both its impact and its story
    const params = shock.roll(e, rollFns(rng));
    shock.apply(e, params);
    events.push({ kind: "shock", id: shock.id, params });
  }
  g.hour += 1;
  walletMark(g.wallet, e, HOURS_PER_DAY);

  const close = g.hour === HOURS_PER_DAY;
  if (close) {
    const b = g.prevClose;
    for (const m of MILESTONES) {
      if (!m.test(g, b)) continue;
      const key = `milestone:${m.id}`;
      if (e.day - (g.lastFired[key] ?? -Infinity) < MILESTONE_REPEAT_DAYS) continue;
      g.lastFired = { ...g.lastFired, [key]: e.day };
      events.push({ kind: "milestone", id: m.id });
    }
    events.push({ kind: "close", stockPct: (e.stockIndex / b.stock - 1) * 100, yieldChg: e.yield10y - b.y10 });
  }

  const snap = snapshot(g);
  g.intraday = appendCapped(g.intraday, snap, INTRADAY_CAP);
  if (close) {
    g.history = appendCapped(g.history, snap, HISTORY_CAP);
    g.hour = 0;
  }
  if (frng) narrate(g, events, frng, AMBIENT_POSTS_PER_DAY / HOURS_PER_DAY);
  return close;
}

// ---------------------------------------------------------------- public API

export function newGame(seed = Date.now() >>> 0): GameState {
  const rng = createRng(seed);
  const frng = createRng(seed ^ 0x9e3779b9);
  const econ = initialEconomy();
  econ.day = -WARMUP_DAYS;
  const g: GameState = {
    seed,
    rngState: 0,
    flavorRngState: 0,
    econ,
    reported: initialReported(econ),
    history: [],
    members: defaultCommittee(),
    marketExpected: econ.policyRate,
    phase: "meeting",
    hour: 0,
    intraday: [],
    prevClose: { stock: econ.stockIndex, y10: econ.yield10y, mortgage: econ.mortgageRate, drawdown: 0 },
    // Held through the warmup year too, so the net-worth chart has history
    wallet: newWallet(econ, econ.homePrice),
    emergency: false,
    emergencyUsed: false,
    cycleDay: 0,
    cycleLength: CYCLE_DAYS[0],
    cooldowns: {},
    meeting: 0,
    meetings: [],
    news: [],
    posts: [],
    alerts: [],
    lastFired: {},
    nextId: 1,
    status: "playing",
    score: 0,
  };
  // Generate a year of "past" data so charts aren't empty at the start.
  for (let i = 0; i < WARMUP_DAYS * HOURS_PER_DAY; i++) tick(g, rng, null);
  // The warmup can drift; keep the opening crisis-free and credible.
  g.econ.credibility = Math.max(g.econ.credibility, 0.75);
  updateMarketExpected(g);
  g.news = [
    { id: g.nextId++, day: 0, headline: "New Fed Chair sworn in; first FOMC meeting today", tone: "neutral" },
  ];
  g.posts = [
    { id: g.nextId++, day: 0, name: "Fed Watcher", handle: "fedwatcher", persona: "economist", text: "New Chair's first FOMC meeting today. All eyes on the statement. 👀", likes: 412, reposts: 88 },
  ];
  g.alerts = [{ ...introAlert(g, frng), id: g.nextId++, day: 0 }];
  saveRngs(g, rng, frng);
  return g;
}

/** Remove the breaking-news popups that match `remove`. */
export function dismissAlerts(prev: GameState, remove: (a: Alert) => boolean): GameState {
  const alerts = prev.alerts.filter((a) => !remove(a));
  return alerts.length === prev.alerts.length ? prev : { ...prev, alerts };
}

/** Advance one trading hour during the inter-meeting cycle. */
export function advanceHour(prev: GameState): GameState {
  if (prev.status !== "playing" || prev.phase !== "cycle") return prev;
  const g = draft(prev);
  const { rng, frng } = rngs(g);

  if (tick(g, rng, frng)) {
    g.cycleDay += 1;
    const over = checkGameOver(g);
    if (over) {
      g.status = "over";
      g.gameOverReason = over;
    } else if (g.cycleDay >= g.cycleLength) {
      g.phase = "meeting";
      g.emergency = false;
      narrate(g, [{ kind: "meetingStart", emergency: false }], frng);
    }
  }
  saveRngs(g, rng, frng);
  return g;
}

/** Advance hours until the next close (or until the cycle stops). */
export function advanceDay(prev: GameState): GameState {
  let g = advanceHour(prev);
  while (g !== prev && g.hour !== 0 && g.status === "playing" && g.phase === "cycle") {
    prev = g;
    g = advanceHour(g);
  }
  return g;
}

/** The Chair puts a proposal to a vote, backed by up to two arguments. */
export function holdMeeting(prev: GameState, proposal: number, argIds: string[] = []): GameState {
  if (prev.status !== "playing" || prev.phase !== "meeting") return prev;
  const g = draft(prev);
  const { rng, frng } = rngs(g);
  const e = g.econ;

  const args = argIds.slice(0, MAX_ARGUMENTS);
  const ctx = evidenceContext(g);
  const view = policyView(g);
  const votes = castVotes(g.members, view, proposal, argumentShifts(g.members, args, ctx, view, proposal));
  const passed = votes.filter((v) => v.yes).length >= MAJORITY;
  const previousRate = e.policyRate;
  const marketExpected = g.marketExpected;

  if (passed) e.policyRate = proposal;
  else e.credibility = Math.max(0, e.credibility - P.failedVoteCredibilityHit);

  // Saying one thing and doing another costs credibility
  const move = e.policyRate - previousRate;
  const reversal = (e.guidance > 0.15 && move < 0) || (e.guidance < -0.15 && move > 0);
  if (reversal) e.credibility = Math.max(0, e.credibility - P.reversalCredibilityHit);

  const beforeStock = e.stockIndex;
  const beforeY10 = e.yield10y;
  applyPolicySurprise(e, e.policyRate - marketExpected);
  const stockPct = (e.stockIndex / beforeStock - 1) * 100;
  const yieldChg = e.yield10y - beforeY10;
  e.guidance *= 0.3; // guidance is "used up" once the decision lands

  const result: MeetingResult = {
    meeting: g.meeting + 1,
    day: e.day,
    emergency: g.emergency,
    proposal,
    previousRate,
    marketExpected,
    passed,
    votes,
    arguments: args.map((id) => ({ id, evidence: argumentEvidence(id, ctx) })),
  };
  g.meetings = [...g.meetings, result];

  if (g.emergency) {
    g.emergencyUsed = true;
  } else {
    g.meeting += 1;
    g.score += meetingScore(g);
    g.cycleDay = 0;
    g.cycleLength = CYCLE_DAYS[g.meeting % CYCLE_DAYS.length];
    g.emergencyUsed = false;
  }
  g.phase = "cycle";
  g.emergency = false;
  updateMarketExpected(g);
  narrate(g, [{ kind: "decision", result, reversal, stockPct, yieldChg }], frng);
  saveRngs(g, rng, frng);
  return g;
}

/** Whether an action can be taken right now, and why not. */
export function actionAvailability(g: GameState, id: ActionId): { ok: boolean; reason?: string } {
  if (g.status !== "playing" || g.phase !== "cycle") return { ok: false, reason: "Only between meetings" };
  const readyDay = g.cooldowns[id] ?? -Infinity;
  if (g.econ.day < readyDay) return { ok: false, reason: `Available in ${readyDay - g.econ.day}d` };
  switch (id) {
    case "hawkishSpeech":
      return g.econ.guidance >= P.maxGuidance - 0.01 ? { ok: false, reason: "Markets already braced" } : { ok: true };
    case "dovishSpeech":
      return g.econ.guidance <= -P.maxGuidance + 0.01 ? { ok: false, reason: "Markets already braced" } : { ok: true };
    case "emergencyMeeting":
      if (g.emergencyUsed) return { ok: false, reason: "Already held one this cycle" };
      if (g.cycleLength - g.cycleDay <= 5) return { ok: false, reason: "Regular meeting is too close" };
      return { ok: true };
    case "lendingFacility":
      return g.econ.financialStress < 0.3 ? { ok: false, reason: "No banking stress" } : { ok: true };
  }
}

export function isCrisis(g: GameState): boolean {
  return g.econ.financialStress > 0.5 || drawdown(g.econ) > 0.15;
}

export function takeAction(prev: GameState, id: ActionId): GameState {
  if (!actionAvailability(prev, id).ok) return prev;
  const g = draft(prev);
  const { rng, frng } = rngs(g);
  const e = g.econ;
  const c = e.credibility; // credible Fed-speak moves markets more

  switch (id) {
    case "hawkishSpeech":
    case "dovishSpeech": {
      const dir = id === "hawkishSpeech" ? 1 : -1;
      e.guidance = clamp(e.guidance + dir * P.speechGuidance * c, -P.maxGuidance, P.maxGuidance);
      applyMarketJump(e, -0.8 * dir * c, 0.08 * dir * c);
      e.inflationExp += dir > 0 ? -0.04 * c : 0.03;
      g.cooldowns[id] = e.day + P.speechCooldown;
      break;
    }
    case "emergencyMeeting":
      if (!isCrisis(g)) e.credibility = Math.max(0, e.credibility - P.needlessEmergencyCredibilityHit);
      applyMarketJump(e, -1, 0);
      g.phase = "meeting";
      g.emergency = true;
      break;
    case "lendingFacility":
      e.financialStress *= 0.35;
      e.balanceSheet += 0.3;
      e.credibility = Math.max(0, e.credibility - P.lendingCredibilityHit);
      applyMarketJump(e, 1.5, 0);
      g.cooldowns[id] = e.day + P.lendingCooldown;
      break;
  }
  updateMarketExpected(g);
  const events: SimEvent[] = [{ kind: "action", id }];
  if (id === "emergencyMeeting") events.push({ kind: "meetingStart", emergency: true });
  narrate(g, events, frng);
  saveRngs(g, rng, frng);
  return g;
}

export function setQePace(prev: GameState, pace: QePace): GameState {
  if (prev.status !== "playing" || prev.econ.qePace === pace) return prev;
  const g = draft(prev);
  const { rng, frng } = rngs(g);
  g.econ.qePace = pace;
  // Announcement effect: markets front-run the bond buying
  applyMarketJump(g.econ, pace * 1.0, -pace * 0.1);
  narrate(g, [{ kind: "qe", pace }], frng);
  saveRngs(g, rng, frng);
  return g;
}

/** Points per meeting: max 100 when inflation is at 2% and unemployment at its natural rate. */
export function meetingScore(g: GameState): number {
  const piLoss = Math.abs(g.reported.cpi.value - P.inflationTarget);
  const uLoss = Math.abs(g.reported.unemployment.value - g.econ.naturalUnemployment);
  return Math.max(0, Math.round(100 - 25 * piLoss - 20 * uLoss));
}

export function checkGameOver(g: GameState): string | undefined {
  const cpi = g.reported.cpi.value;
  const u = g.reported.unemployment.value;
  if (cpi >= P.maxInflation) return `Inflation hit ${cpi.toFixed(1)}%. Congress has removed you from office.`;
  if (cpi <= P.minInflation) return `Deflation of ${cpi.toFixed(1)}% has triggered a depression spiral.`;
  if (u >= P.maxUnemployment) return `Unemployment reached ${u.toFixed(1)}%. You have been forced to resign.`;
  if (g.econ.credibility <= P.minCredibility)
    return "The Fed's credibility has collapsed. Markets no longer believe a word you say.";
  return undefined;
}
