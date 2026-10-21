// The Xenopedia's pages as data: every tower, ultimate, enemy and ability with the numbers the game really uses. The
// numbers are computed by the game's own formulas (src/game/rules.ts) from balance.yaml, and the words are the texts
// of src/i18n, so a page cannot go stale: change the balance and the page changes with it. Pure: no DOM, no storage.
// The interface formats the numbers and draws the pages.
import { abilityCost, enemyAt, towerStats, upCost } from "../game/rules";
import type { AbilityKey, Balance, DiffKey, EnemyType, TowerStats, TowerType } from "../game/types";

/** The waves the enemy and ability tables are given for: the start, the middle game, the late game. */
export const PEDIA_WAVES = [1, 10, 25, 50, 100] as const;

export interface PediaSource {
  B: Balance;
  /** A text of the game data by path, e.g. "towers.gun.name" (core.gameText). */
  text(path: string): string;
}

/** The stats of a tower at one level, ready to show. */
export interface LevelRow {
  /** 1..4, or 5 for an ultimate */
  level: number;
  /** the price to reach this level (the ultimate: its price) */
  cost: number;
  stats: TowerStats;
  /** damage per second: damage ÷ the seconds between shots; a beam (the laser) deals its damage every second.
   *  Burning, splash and slowing are not counted. */
  dps: number;
}

export interface UltimatePage {
  id: string;
  name: string;
  desc: string;
  /** what the tower is at level 5 with this ultimate */
  row: LevelRow;
}

export interface TowerPage {
  id: TowerType;
  name: string;
  /** what the tower is for, in words */
  desc: string;
  /** the side of its square, in cells */
  size: number;
  /** what it can hit */
  air: boolean;
  ground: boolean;
  /** levels 1..4 */
  levels: LevelRow[];
  ultimates: UltimatePage[];
  /** each overclock after level 5: damage and range multiply, the first costs `firstCost`, the next ×`costGrowth` */
  overclock: { damage: number; range: number; firstCost: number; costGrowth: number };
}

/** What an enemy is on a wave: health, armour and the reward, on each difficulty (on a map with hp 1). */
export interface EnemyRow {
  wave: number;
  hp: Record<DiffKey, number>;
  armor: Record<DiffKey, number>;
  reward: Record<DiffKey, number>;
}

export interface EnemyPage {
  id: EnemyType;
  name: string;
  /** cells a second on easy; the other difficulties multiply it */
  speed: Record<DiffKey, number>;
  flying: boolean;
  boss: boolean;
  /** lives it costs when it gets to the gate */
  lives: number;
  rows: EnemyRow[];
}

export interface AbilityPage {
  id: AbilityKey;
  name: string;
  desc: string;
  /** seconds before it can be used again */
  cooldown: number;
  /** how it is aimed: not at all, a circle, a row */
  aim: 0 | "circle" | "row";
  radius?: number;
  /** the price on a wave, on each difficulty */
  costs: { wave: number; cost: Record<DiffKey, number> }[];
}

export interface Pedia {
  towers: TowerPage[];
  enemies: EnemyPage[];
  abilities: AbilityPage[];
}

const diffs = (B: Balance) => Object.keys(B.difficulty) as DiffKey[];
const perDiff = <T>(B: Balance, f: (d: DiffKey) => T) =>
  Object.fromEntries(diffs(B).map((d) => [d, f(d)])) as Record<DiffKey, T>;

function towerPage(S: PediaSource, id: TowerType): TowerPage {
  const { B } = S,
    d = B.towers[id];
  const row = (level: number, ult?: string): LevelRow => {
    const stats = towerStats(B, id, level - 1, ult);
    return {
      level,
      // level 1 is the price of building, 2-4 of the upgrades, 5 of the ultimate
      cost: level <= 4 ? d.cost[level - 1] : d.cost[3] * B.economy.ultimateCostMultiplier,
      stats,
      dps: stats.rate > 0 ? stats.dmg / stats.rate : stats.dmg,
    };
  };
  const o = B.economy.overclock;
  return {
    id,
    name: S.text(`towers.${id}.name`),
    desc: S.text(`towers.${id}.desc`),
    size: d.size ?? 1,
    air: !!d.air,
    ground: !!d.ground,
    levels: [1, 2, 3, 4].map((l) => row(l)),
    ultimates: Object.keys(d.ults).map((u) => ({
      id: u,
      name: S.text(`towers.${id}.ults.${u}.name`),
      desc: S.text(`towers.${id}.ults.${u}.desc`),
      row: row(5, u),
    })),
    overclock: {
      damage: o.damageGrowth,
      range: o.rangeGrowth,
      firstCost: upCost(B, { type: id, lvl: 4, oc: 0 }),
      costGrowth: o.costGrowth,
    },
  };
}

function enemyPage(S: PediaSource, id: EnemyType): EnemyPage {
  const { B } = S,
    T = B.enemies[id];
  return {
    id,
    name: S.text(`enemies.${id}.name`),
    speed: perDiff(B, (d) => T.spd * B.difficulty[d].spd),
    flying: !!T.fly,
    boss: !!T.boss,
    lives: T.lives ?? 1,
    rows: PEDIA_WAVES.map((wave) => {
      const at = (d: DiffKey) => enemyAt(B, B.difficulty[d], 1, id, wave);
      return {
        wave,
        hp: perDiff(B, (d) => at(d).hp),
        armor: perDiff(B, (d) => at(d).armor),
        reward: perDiff(B, (d) => at(d).rw),
      };
    }),
  };
}

function abilityPage(S: PediaSource, id: AbilityKey): AbilityPage {
  const { B } = S,
    A = B.abilities[id];
  return {
    id,
    name: S.text(`abilities.${id}.name`),
    desc: S.text(`abilities.${id}.desc`),
    cooldown: A.cd,
    aim: A.aim,
    radius: A.r,
    costs: PEDIA_WAVES.map((wave) => ({
      wave,
      cost: perDiff(B, (d) => abilityCost(B, B.difficulty[d], id, wave)),
    })),
  };
}

/** Every page of the Xenopedia, in the order of the balance data. */
export function buildPedia(S: PediaSource): Pedia {
  const keys = <T extends string>(o: object) => Object.keys(o) as T[];
  return {
    towers: keys<TowerType>(S.B.towers).map((id) => towerPage(S, id)),
    enemies: keys<EnemyType>(S.B.enemies).map((id) => enemyPage(S, id)),
    abilities: keys<AbilityKey>(S.B.abilities).map((id) => abilityPage(S, id)),
  };
}
