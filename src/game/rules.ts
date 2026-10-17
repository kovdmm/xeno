// Pure formulas: tower stats by level, upgrade prices, enemy health curve.
import { TT } from "./data/towers";
import type { Difficulty, Tower, TowerStats, TowerType } from "./types";

/** Stats of a tower of this type at a given level; `ult` applies from level 4, `oc` is the overclock count. */
export function towerStats(type: TowerType, lvl: number, ult?: string, oc?: number): TowerStats {
  const d = TT[type],
    L = Math.min(lvl, 3);
  const s: TowerStats = {
    dmg: d.dmg[L],
    rate: d.rate[L],
    range: d.range[L],
    splash: d.splash ? d.splash[L] : 0,
    slow: d.slow ? d.slow[L] : 0,
    burn: d.burn ? d.burn[L] : 0,
    minR: d.minR || 0,
    beams: 1,
    width: 1,
    pierce: !!d.pierce,
    air: d.air,
    ground: d.ground,
    prio: d.prio || "first",
    multi: 0,
  };
  if (lvl >= 4 && ult && d.ults[ult]) {
    s.pierce = true;
    d.ults[ult].f(s);
  }
  if (oc) {
    const m = Math.pow(1.25, oc);
    s.dmg *= m;
    s.burn *= m;
  }
  return s;
}

export const statsOf = (t: Pick<Tower, "type" | "lvl" | "ult" | "oc">): TowerStats =>
  towerStats(t.type, t.lvl, t.ult, t.oc);

/** Price of the next upgrade. */
export function upCost(t: Pick<Tower, "type" | "lvl" | "oc">): number {
  const c = TT[t.type].cost;
  if (t.lvl < 3) return c[t.lvl + 1];
  if (t.lvl === 3) return c[3] * 3;
  return Math.round(c[3] * 1.5 * Math.pow(1.45, t.oc));
}

/** 0 → 1 smoothstep over waves 8..60: how far into the midgame ramp we are. */
export function ramp(n: number): number {
  const t = Math.max(0, Math.min(1, (n - 8) / 52));
  return t * t * (3 - 2 * t);
}
export const diffHP = (D: Difficulty, n: number): number => 1 + (D.hp - 1) * ramp(n);

/** Quadratic growth, plus an exponential factor after wave 100 so the wall arrives near the end. */
export function hpScale(n: number): number {
  let m = 1 + 0.24 * (n - 1) + 0.02 * (n - 1) * (n - 1);
  if (n > 100) m *= Math.pow(1.013, n - 100);
  return m;
}

/** Health of a basic unit of wave n (also the damage scale of abilities). */
export const unitHP = (D: Difficulty, n: number): number => 32 * hpScale(Math.max(1, n)) * diffHP(D, Math.max(1, n));
