/**
 * Headless balance harness: plays many games with simple strategies and
 * reports how long each survives. Run with `npm run sim [games]`.
 */
import { committeeMedian, roundQuarter } from "../src/sim/fomc";
import { advanceDay, holdMeeting, newGame, policyView } from "../src/sim/game";
import type { GameState } from "../src/sim/types";

type Strategy = (g: GameState) => number;

const strategies: Record<string, Strategy> = {
  "follow committee": (g) => committeeMedian(g.members, policyView(g)),
  "taylor rule": (g) => {
    const v = policyView(g);
    const t = 0.75 + v.inflation + 0.5 * (v.inflation - 2) + 0.5 * v.gapEst;
    return Math.max(0, roundQuarter(v.policyRate + Math.max(-0.5, Math.min(0.5, t - v.policyRate))));
  },
  "never move": (g) => g.econ.policyRate,
  "always 0%": () => 0,
  "always 8%": () => 8,
};

const GAMES = Number(process.argv[2] ?? 100);
const MAX_MEETINGS = 8 * 30; // 30 years

/** Plays one meeting plus the following cycle. */
export function playTurn(g: GameState, proposal: number): GameState {
  g = holdMeeting(g, proposal);
  while (g.status === "playing" && g.phase === "cycle") g = advanceDay(g);
  return g;
}

for (const [name, strat] of Object.entries(strategies)) {
  const lengths: number[] = [];
  const reasons: Record<string, number> = {};
  let scoreSum = 0;
  for (let seed = 1; seed <= GAMES; seed++) {
    let g = newGame(seed);
    while (g.status === "playing" && g.meeting < MAX_MEETINGS) g = playTurn(g, strat(g));
    lengths.push(g.meeting);
    scoreSum += g.score / Math.max(1, g.meeting);
    if (g.gameOverReason) {
      const key = g.gameOverReason.split(" ").slice(0, 2).join(" ");
      reasons[key] = (reasons[key] ?? 0) + 1;
    }
  }
  lengths.sort((a, b) => a - b);
  const survived = lengths.filter((l) => l >= MAX_MEETINGS).length;
  console.log(
    `${name.padEnd(18)} median ${(lengths[lengths.length >> 1] / 8).toFixed(1).padStart(5)}y` +
      `  survived 30y: ${((survived / GAMES) * 100).toFixed(0).padStart(3)}%` +
      `  avg pts/meeting: ${(scoreSum / GAMES).toFixed(0).padStart(3)}` +
      `  endings: ${JSON.stringify(reasons)}`,
  );
}
