/** Seeded PRNG (mulberry32) so every game/simulation is reproducible from a seed. */
export interface Rng {
  next(): number; // uniform [0, 1)
  normal(): number; // standard normal
  state: number;
}

export function createRng(seed: number): Rng {
  const rng: Rng = {
    state: seed >>> 0,
    next() {
      let t = (rng.state = (rng.state + 0x6d2b79f5) >>> 0);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    normal() {
      // Box–Muller
      const u = Math.max(rng.next(), 1e-12);
      const v = rng.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
  return rng;
}
