import { P } from "./config";
import { EVENTS, type EventDef, type Roll } from "./content/events";
import type { Rng } from "./rng";
import type { Economy } from "./types";

/**
 * Roll for a random world event. `perDay` = how many rolls happen per trading
 * day; event likelihoods can depend on the economy (see content/events.ts).
 */
export function rollShock(rng: Rng, e: Economy, perDay = 1): EventDef | undefined {
  if (rng.next() >= P.shockChancePerDay / perDay) return undefined;
  const weights = EVENTS.map((ev) => Math.max(0, ev.weight(e)));
  let r = rng.next() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < EVENTS.length; i++) {
    r -= weights[i];
    if (r < 0) return EVENTS[i];
  }
  return EVENTS[EVENTS.length - 1];
}

/** Random helpers for rolling an event's specifics (uses the sim RNG: rolls affect the economy). */
export function rollFns(rng: Rng): Roll {
  return {
    sev: () => Math.min(2.5, Math.max(0.4, Math.exp(0.45 * rng.normal()))),
    uni: (lo, hi) => lo + rng.next() * (hi - lo),
    int: (lo, hi) => lo + Math.floor(rng.next() * (hi - lo + 1)),
  };
}
