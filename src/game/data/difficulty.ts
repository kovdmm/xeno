import type { Difficulty, DiffKey } from "../types";

/* Difficulty. Easy is the original balance. Harder levels ramp HP up through the midgame
   (waves ~8–60) so long mazes alone stop being enough, add armor, speed, mixed waves and
   two maze-countering enemies, and pay less. */
export const DIFF: Record<DiffKey, Difficulty> = {
  easy: {
    hp: 1,
    armor: 0,
    armorDiv: 8,
    spd: 1,
    rw: 1,
    credits: 110,
    lives: 20,
    ab: 1,
    gap: 22,
    mixFrom: 999,
    newFrom: 999,
  },
  normal: {
    hp: 1.9,
    armor: 1,
    armorDiv: 8,
    spd: 1.05,
    rw: 0.9,
    credits: 100,
    lives: 20,
    ab: 1.2,
    gap: 20,
    mixFrom: 30,
    newFrom: 30,
  },
  hard: {
    hp: 2.5,
    armor: 2,
    armorDiv: 7,
    spd: 1.1,
    rw: 0.8,
    credits: 95,
    lives: 20,
    ab: 1.4,
    gap: 18,
    mixFrom: 18,
    newFrom: 20,
  },
  insane: {
    hp: 3.4,
    armor: 4,
    armorDiv: 6,
    spd: 1.18,
    rw: 0.7,
    credits: 90,
    lives: 15,
    ab: 1.7,
    gap: 16,
    mixFrom: 10,
    newFrom: 12,
  },
};

export const DKEYS = Object.keys(DIFF) as DiffKey[];
