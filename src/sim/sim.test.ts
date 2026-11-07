import { describe, expect, it } from "vitest";
import { argumentEvidence, argumentShifts, evidenceContext } from "./arguments";
import { initialEconomy } from "./config";
import { housingConstant, stepDay } from "./economy";
import { castVotes, committeeMedian } from "./fomc";
import { actionAvailability, advanceDay, advanceHour, holdMeeting, newGame, policyView, takeAction } from "./game";
import { scheduledReleases } from "./releases";
import { createRng } from "./rng";
import type { GameState } from "./types";

/** Average outcome of running the economy for `years` with a fixed policy rate. */
function runFixedRate(rate: number, years: number, seeds = 30) {
  let pi = 0, u = 0, stocks = 0;
  for (let s = 1; s <= seeds; s++) {
    const e = initialEconomy();
    const k = housingConstant(e);
    e.policyRate = rate;
    const rng = createRng(s);
    for (let d = 0; d < years * 260; d++) stepDay(e, rng, k, rate);
    pi += e.inflation / seeds;
    u += e.unemployment / seeds;
    stocks += e.stockIndex / seeds;
  }
  return { pi, u, stocks };
}

const runCycle = (g: GameState) => {
  while (g.status === "playing" && g.phase === "cycle") g = advanceDay(g);
  return g;
};

describe("macro model", () => {
  it("loose policy raises inflation and lowers unemployment", () => {
    const loose = runFixedRate(0.5, 3);
    const tight = runFixedRate(6, 3);
    expect(loose.pi).toBeGreaterThan(tight.pi + 1);
    expect(loose.u).toBeLessThan(tight.u - 1);
  });

  it("very tight policy pushes stocks down relative to neutral", () => {
    expect(runFixedRate(7, 2).stocks).toBeLessThan(runFixedRate(2.75, 2).stocks);
  });
});

describe("data calendar", () => {
  it("releases jobs, CPI and housing monthly and claims weekly", () => {
    const counts: Record<string, number> = {};
    // Two years, so window edges can shift each count by at most one
    for (let d = 0; d < 520; d++) for (const k of scheduledReleases(d)) counts[k] = (counts[k] ?? 0) + 1;
    for (const k of ["cpi", "payrolls", "homePrice"]) expect(counts[k]).toBeGreaterThanOrEqual(23);
    expect(counts.gdp).toBeGreaterThanOrEqual(7);
    expect(counts.claims).toBeGreaterThanOrEqual(103);
  });
});

describe("game loop", () => {
  it("starts in a meeting, then runs a full cycle back to the next meeting", () => {
    let g = newGame(5);
    expect(g.phase).toBe("meeting");
    g = holdMeeting(g, g.econ.policyRate);
    expect(g.phase).toBe("cycle");
    const startDay = g.econ.day;
    const cycleLength = g.cycleLength;
    g = runCycle(g);
    expect(g.phase).toBe("meeting");
    expect(g.econ.day - startDay).toBe(cycleLength);
    expect(g.posts.length).toBeGreaterThan(20);
    expect(g.news.length).toBeGreaterThan(3);
  });

  it("is deterministic for a given seed", () => {
    const a = runCycle(holdMeeting(newGame(42), 3.75));
    const b = runCycle(holdMeeting(newGame(42), 3.75));
    expect(a.econ).toEqual(b.econ);
    expect(a.posts.map((p) => p.text)).toEqual(b.posts.map((p) => p.text));
  });

  it("an extreme proposal fails and leaves rates unchanged", () => {
    const g = newGame(7);
    const after = holdMeeting(g, 10);
    expect(after.meetings[0].passed).toBe(false);
    expect(after.econ.policyRate).toBe(g.econ.policyRate);
  });

  it("the committee median passes", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = newGame(seed);
      const after = holdMeeting(g, committeeMedian(g.members, policyView(g)));
      expect(after.meetings[0].passed).toBe(true);
    }
  });
});

describe("arguments", () => {
  it("supported arguments pull toward the proposal without overshooting; contradicted ones backfire", () => {
    // Find an opening where inflation is clearly hot, so the test doesn't depend on one seed
    let seed = 1;
    while (newGame(seed).reported.cpi.value < 3.2) seed++;
    const g = newGame(seed);
    const ctx = evidenceContext(g);
    const view = policyView(g);
    expect(argumentEvidence("hotInflation", ctx)).toBeGreaterThan(0);
    expect(argumentEvidence("coolingInflation", ctx)).toBeLessThan(0);

    const proposal = committeeMedian(g.members, view) + 0.5;
    const votes = castVotes(g.members, view, proposal, argumentShifts(g.members, ["hotInflation"], ctx, view, proposal));
    for (const v of votes) {
      if (v.preferred < proposal) {
        expect(v.persuaded).toBeGreaterThanOrEqual(v.preferred);
        expect(v.persuaded).toBeLessThanOrEqual(proposal + 1e-9);
      }
    }
    // A bogus dovish claim pushes everyone up (away from a cut)
    const cut = view.policyRate - 0.25;
    const back = argumentShifts(g.members, ["coolingInflation"], ctx, view, cut);
    expect(back.p1).toBeGreaterThan(0);
  });

  it("a good argument never loses votes for a bigger move", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = newGame(seed);
      const view = policyView(g);
      const ctx = evidenceContext(g);
      for (const proposal of [view.policyRate - 0.5, view.policyRate + 0.75]) {
        const best = (["hotInflation", "coolingInflation"] as const).filter((id) => argumentEvidence(id, ctx) > 0);
        const without = castVotes(g.members, view, proposal).filter((v) => v.yes).length;
        const withArgs = castVotes(g.members, view, proposal, argumentShifts(g.members, [...best], ctx, view, proposal)).filter((v) => v.yes).length;
        expect(withArgs).toBeGreaterThanOrEqual(without);
      }
    }
  });
});

describe("actions", () => {
  it("a hawkish speech raises yields and goes on cooldown", () => {
    const g = holdMeeting(newGame(3), 3.5);
    const after = takeAction(g, "hawkishSpeech");
    expect(after.econ.yield10y).toBeGreaterThan(g.econ.yield10y);
    expect(after.econ.guidance).toBeGreaterThan(0);
    expect(actionAvailability(after, "hawkishSpeech").ok).toBe(false);
  });

  it("an emergency meeting opens a meeting mid-cycle and returns to the same cycle", () => {
    let g = holdMeeting(newGame(3), 3.5);
    for (let i = 0; i < 5; i++) g = advanceDay(g);
    g = takeAction(g, "emergencyMeeting");
    expect(g.phase).toBe("meeting");
    expect(g.emergency).toBe(true);
    const meeting = g.meeting;
    g = holdMeeting(g, g.econ.policyRate);
    expect(g.phase).toBe("cycle");
    expect(g.cycleDay).toBe(5);
    expect(g.meeting).toBe(meeting);
    expect(actionAvailability(g, "emergencyMeeting").ok).toBe(false);
  });
});

describe("world events", () => {
  it("each occurrence rolls its own size, and bigger rolls hit the economy harder", async () => {
    const { EVENTS } = await import("./content/events");
    const { rollFns } = await import("./shocks");
    for (const ev of EVENTS) {
      const rng = createRng(123);
      const rolls = Array.from({ length: 40 }, () => ev.roll(initialEconomy(), rollFns(rng)));
      // Numbers vary between occurrences
      const distinct = new Set(rolls.map((p) => JSON.stringify(p)));
      expect(distinct.size, ev.id).toBeGreaterThan(5);
      // Text uses the rolled numbers
      expect(ev.popup.headline(rolls[0]).length, ev.id).toBeGreaterThan(5);
      // Impact scales with the roll: compare the mildest and the most severe occurrence
      const impact = (p: Record<string, number>) => {
        const e = initialEconomy();
        const before = { ...e };
        ev.apply(e, p);
        return Math.abs(e.supplyShock - before.supplyShock) + Math.abs(e.demandShock - before.demandShock) +
          Math.abs(e.financialStress - before.financialStress) + Math.abs(Math.log(e.stockIndex / before.stockIndex)) * 10 +
          Math.abs(e.yield10y - before.yield10y) + Math.abs(e.potentialGrowth - before.potentialGrowth) + Math.abs(Math.log(e.homePrice / before.homePrice)) * 10;
      };
      const impacts = rolls.map(impact).sort((a, b) => a - b);
      expect(impacts[impacts.length - 1], ev.id).toBeGreaterThan(impacts[0] * 1.3);
    }
  });
});

describe("save / load", () => {
  it("a saved game resumes exactly where it left off", async () => {
    const { encodeSave, decodeSave } = await import("../state/persistence");
    // Play into the middle of a cycle, with history, news, posts and a wallet
    let g = holdMeeting(newGame(21), 3.75, ["hotInflation"]);
    for (let i = 0; i < 40; i++) g = advanceHour(g);
    const restored = decodeSave(encodeSave(g))!;
    expect(restored).not.toBeNull();
    // Continue both for a full cycle: identical economy, wallet and feeds
    let a = g, b = restored.game;
    while (a.phase === "cycle") a = advanceDay(a);
    while (b.phase === "cycle") b = advanceDay(b);
    expect(b.econ).toEqual(a.econ);
    expect(b.wallet).toEqual(a.wallet);
    expect(b.reported).toEqual(a.reported);
    expect(b.posts.slice(0, 20).map((p) => p.text)).toEqual(a.posts.slice(0, 20).map((p) => p.text));
  });

  it("rejects corrupt or incompatible saves", async () => {
    const { decodeSave, encodeSave } = await import("../state/persistence");
    expect(decodeSave(null)).toBeNull();
    expect(decodeSave("{not json")).toBeNull();
    expect(decodeSave(JSON.stringify({ version: 999, game: newGame(1) }))).toBeNull();
    expect(decodeSave(JSON.stringify({ version: 1, game: { seed: 1 } }))).toBeNull();
    expect(decodeSave(encodeSave(newGame(1)))).not.toBeNull();
  });
});
