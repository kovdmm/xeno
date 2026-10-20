// The simulation's random numbers: a small seeded generator, so a game is a function of its seed and the player's
// actions (what the server replays to check a score, and what the balance simulator relies on).

/** mulberry32: 32 bits of state, uniform in [0, 1). Integer arithmetic only, the same in every engine. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
