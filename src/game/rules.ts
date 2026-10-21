// Pure formulas: tower stats by level, upgrade prices, enemy health curve. Every number comes from the balance.
import { pow } from "./dmath";
import type { AbilityKey, Balance, Difficulty, EnemyType, Tower, TowerStats, TowerType, UltEffect } from "./types";

/** Applies an ultimate to a stat block: first `set`, then `mul`, then `div`. */
function applyEffect(s: TowerStats, e: UltEffect): void {
  const stats = s as unknown as Record<string, number | string | boolean | undefined>;
  for (const [k, v] of Object.entries(e.set ?? {})) stats[k] = v;
  for (const [k, v] of Object.entries(e.mul ?? {})) (stats[k] as number) *= v!;
  for (const [k, v] of Object.entries(e.div ?? {})) (stats[k] as number) /= v!;
}

/** Stats of a tower of this type at a given level; `ult` applies from level 4, `oc` is the overclock count. */
export function towerStats(B: Balance, type: TowerType, lvl: number, ult?: string, oc?: number): TowerStats {
  const d = B.towers[type],
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
    applyEffect(s, d.ults[ult]);
  }
  if (oc) {
    const m = pow(B.economy.overclock.damageGrowth, oc);
    s.dmg *= m;
    s.burn *= m;
    s.range *= pow(B.economy.overclock.rangeGrowth, oc);
  }
  return s;
}

export const statsOf = (B: Balance, t: Pick<Tower, "type" | "lvl" | "ult" | "oc">): TowerStats =>
  towerStats(B, t.type, t.lvl, t.ult, t.oc);

/** Price of the next upgrade. */
export function upCost(B: Balance, t: Pick<Tower, "type" | "lvl" | "oc">): number {
  const c = B.towers[t.type].cost,
    o = B.economy.overclock;
  if (t.lvl < 3) return c[t.lvl + 1];
  if (t.lvl === 3) return c[3] * B.economy.ultimateCostMultiplier;
  return Math.round(c[3] * o.costBase * pow(o.costGrowth, t.oc));
}

/** 0 → 1 smoothstep over the midgame ramp: how far into it wave n is. */
export function ramp(B: Balance, n: number): number {
  const t = Math.max(0, Math.min(1, (n - B.scaling.rampFromWave) / B.scaling.rampLength));
  return t * t * (3 - 2 * t);
}
export const diffHP = (B: Balance, D: Difficulty, n: number): number => 1 + (D.hp - 1) * ramp(B, n);

/** Quadratic growth, plus an exponential factor in the late game so the wall arrives near the end. */
export function hpScale(B: Balance, n: number): number {
  const c = B.scaling;
  let m = 1 + c.linear * (n - 1) + c.quadratic * (n - 1) * (n - 1);
  if (n > c.lateFromWave) m *= pow(c.lateGrowth, n - c.lateFromWave);
  return m;
}

/**
 * What an enemy of wave n is on a difficulty and a map: health, armour, speed and reward. `mult` is the wave entry's
 * own multiplier (bosses, the final wave); `mapHp` the map's hp coefficient. Bosses take only the square root of the
 * difficulty HP bonus, so boss waves stay beatable; flyers skip the maze and spend far less time under fire, so their
 * HP grows slower. The spawner and the Xenopedia both read this, so the pages never go stale.
 */
export function enemyAt(B: Balance, D: Difficulty, mapHp: number, type: EnemyType, n: number, mult = 1) {
  const T = B.enemies[type],
    dh = diffHP(B, D, n),
    hs = T.fly ? pow(hpScale(B, n), B.scaling.flyerHpExponent) : hpScale(B, n);
  const m = hs * (T.boss ? Math.sqrt(dh) : dh) * mult * mapHp;
  return {
    hp: T.hp * m,
    armor: T.armor ? T.armor + Math.floor(n / D.armorDiv) + D.armor : 0,
    spd: T.spd * D.spd,
    rw: Math.max(1, Math.round(T.rw * (1 + n * B.scaling.rewardGrowth) * mult * D.rw)),
  };
}

/** The price of an ability on a wave: it grows with the wave and with the difficulty. */
export const abilityCost = (B: Balance, D: Difficulty, k: AbilityKey, wave: number): number =>
  Math.round((B.abilities[k].base + B.abilities[k].per * Math.max(1, wave)) * D.ab);

/** Health of a basic unit of wave n (also the damage scale of abilities). */
export const unitHP = (B: Balance, D: Difficulty, n: number): number =>
  B.scaling.unitHp * hpScale(B, Math.max(1, n)) * diffHP(B, D, Math.max(1, n));
