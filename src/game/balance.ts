// The game's numbers live in data/balance.yaml. This module types and validates that file, so a typo in
// the YAML fails loudly at startup (and in tests) instead of producing NaN deep inside the simulation.
import raw from "./data/balance.yaml";
import type { Balance } from "./types";

const TOWERS = ["gun", "cannon", "frost", "missile", "laser", "plasma", "rail", "artillery"];
const ENEMIES = ["crawler", "runner", "swarm", "armored", "flyer", "healer", "blinker", "boss", "queen"];
const DIFFS = ["easy", "normal", "hard", "insane"];
const ABILITIES = ["stasis", "meteor", "napalm", "carpet", "nuke"];
const STATS = [
  "dmg",
  "rate",
  "range",
  "splash",
  "slow",
  "burn",
  "minR",
  "beams",
  "width",
  "pierce",
  "air",
  "ground",
  "prio",
  "multi",
  "cluster",
  "stun",
  "freeze",
  "vuln",
  "heat",
  "nova",
  "plague",
];
/** the numbers each ability needs at runtime */
const ABILITY_FIELDS: Record<string, string[]> = {
  stasis: ["slow", "bossSlow", "duration"],
  meteor: ["count", "interval", "fall", "damageUnits", "impactRadius"],
  napalm: ["duration", "dpsUnits"],
  carpet: ["speed", "bombInterval", "spread", "fall", "damageUnits", "impactRadius", "startX", "exitMargin"],
  nuke: ["delay", "damageUnits", "hpFraction", "bossHpFraction"],
};

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

const isCell = (c: unknown): c is [number, number] =>
  Array.isArray(c) && c.length === 2 && Number.isInteger(c[0]) && Number.isInteger(c[1]);
const isStep = (d: unknown): d is [number, number] =>
  Array.isArray(d) && d.length === 2 && isNum(d[0]) && isNum(d[1]) && Math.abs(d[0]) + Math.abs(d[1]) === 1;

/** One level: a board, its routes and walls. Also checks that every spawn can reach its exit. */
function validateLevel(
  p: string,
  id: string,
  L: Obj,
  bad: (path: string, why: string) => void,
  num: (path: string, v: unknown, min?: number, int?: boolean) => void,
  /** the last map of the list opens nothing after it, so it has no `nextMap` threshold */
  last: boolean,
) {
  if (!/^[a-z][a-z0-9_-]*$/.test(id))
    bad(p, "the id must be lower case letters, digits, - or _ (it names texts and saved records)");
  if (!isObj(L) || !isObj(L.map)) return bad(p, "expected { finalWave, map }");
  // one length per difficulty, growing with the difficulty
  let shortest = Infinity;
  if (!isObj(L.finalWave)) bad(`${p}.finalWave`, "expected one number per difficulty: " + DIFFS.join(", "));
  else {
    for (const k of Object.keys(L.finalWave))
      if (!DIFFS.includes(k)) bad(`${p}.finalWave.${k}`, "unknown difficulty");
    let prev = 0;
    for (const d of DIFFS) {
      const v = L.finalWave[d];
      num(`${p}.finalWave.${d}`, v, 1, true);
      if (!isNum(v)) continue;
      if (v < prev) bad(`${p}.finalWave.${d}`, "a harder difficulty must not be shorter than an easier one");
      prev = v;
      shortest = Math.min(shortest, v);
    }
  }
  num(`${p}.hp`, L.hp, 0.05);
  if (!isObj(L.unlock)) bad(`${p}.unlock`, "expected { difficulty, nextMap }");
  else {
    const need = (k: string, v: unknown) => {
      num(`${p}.unlock.${k}`, v, 1, true);
      if (isNum(v) && v > shortest) bad(`${p}.unlock.${k}`, "is above the final wave: it can never be reached");
    };
    need("difficulty", L.unlock.difficulty);
    if (last) {
      if (L.unlock.nextMap !== undefined) bad(`${p}.unlock.nextMap`, "the last map opens nothing after it");
    } else need("nextMap", L.unlock.nextMap);
  }
  const M = L.map;
  num(`${p}.map.width`, M.width, 3, true);
  num(`${p}.map.height`, M.height, 3, true);
  if (!isNum(M.width) || !isNum(M.height)) return;
  const { width: W, height: H } = M;
  const inside = ([x, y]: number[]) => x >= 0 && y >= 0 && x < W && y < H;
  const cells = (path: string, v: unknown, what: string): [number, number][] => {
    if (!Array.isArray(v) || !v.length) return (bad(path, `expected a non-empty list of ${what}`), []);
    const out: [number, number][] = [];
    v.forEach((c, i) => {
      if (!isCell(c)) return bad(`${path}[${i}]`, "expected [x, y] with whole numbers");
      if (!inside(c)) return bad(`${path}[${i}]`, "outside the board");
      out.push(c);
    });
    return out;
  };
  const gates = new Set<number>();
  const routes = M.routes;
  if (!isObj(routes) || !Object.keys(routes).length) return bad(`${p}.map.routes`, "expected at least one route");
  for (const [r, R] of Object.entries<Obj>(routes)) {
    const rp = `${p}.map.routes.${r}`;
    if (!/^[a-z][a-z0-9_-]*$/.test(r)) bad(rp, "the route name must be lower case letters, digits, - or _");
    if (!isObj(R)) {
      bad(rp, "expected an object");
      continue;
    }
    const spawn = cells(`${rp}.spawn`, R.spawn, "cells"),
      exit = cells(`${rp}.exit`, R.exit, "cells");
    if (!isStep(R.dir)) bad(`${rp}.dir`, "expected a unit step like [1, 0]");
    if (R.exitDir !== undefined && !isStep(R.exitDir)) bad(`${rp}.exitDir`, "expected a unit step like [1, 0]");
    if (isStep(R.dir))
      for (const [x, y] of spawn)
        if (inside([x - R.dir[0], y - R.dir[1]]))
          bad(`${rp}.spawn`, `[${x}, ${y}] is not on the edge: enemies come in against dir`);
    const xd = isStep(R.exitDir) ? R.exitDir : isStep(R.dir) ? R.dir : null;
    if (xd)
      for (const [x, y] of exit)
        if (inside([x + xd[0], y + xd[1]]))
          bad(`${rp}.exit`, `[${x}, ${y}] is not on the edge: enemies leave along exitDir`);
    for (const [x, y] of [...spawn, ...exit]) {
      if (gates.has(y * W + x)) bad(rp, `the cell [${x}, ${y}] is a gate twice`);
      gates.add(y * W + x);
    }
  }
  const walls = new Set<number>();
  if (M.walls !== undefined) {
    if (!Array.isArray(M.walls)) bad(`${p}.map.walls`, "expected a list of blocks { x, y, w, h }");
    else
      M.walls.forEach((r: Obj, i: number) => {
        const wp = `${p}.map.walls[${i}]`;
        if (!isObj(r) || ![r.x, r.y, r.w, r.h].every(Number.isInteger))
          return bad(wp, "expected { x, y, w, h } with whole numbers");
        if (r.w < 1 || r.h < 1) return bad(wp, "w and h must be at least 1");
        if (!inside([r.x, r.y]) || !inside([r.x + r.w - 1, r.y + r.h - 1])) return bad(wp, "outside the board");
        for (let y = r.y; y < r.y + r.h; y++)
          for (let x = r.x; x < r.x + r.w; x++) {
            const k = y * W + x;
            if (gates.has(k)) bad(wp, `covers the gate cell [${x}, ${y}]`);
            walls.add(k);
          }
      });
  }
  // every spawn cell must be able to reach an exit of its route (nothing is built yet)
  for (const [r, R] of Object.entries<Obj>(routes)) {
    if (!isObj(R) || !Array.isArray(R.exit) || !Array.isArray(R.spawn)) continue;
    const d = new Map<number, number>();
    const q: number[] = [];
    for (const c of R.exit) if (isCell(c) && inside(c)) (d.set(c[1] * W + c[0], 0), q.push(c[1] * W + c[0]));
    for (let h = 0; h < q.length; h++) {
      const x = q[h] % W,
        y = (q[h] / W) | 0;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx,
          ny = y + dy,
          j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || d.has(j) || walls.has(j)) continue;
        d.set(j, 1);
        q.push(j);
      }
    }
    for (const c of R.spawn)
      if (isCell(c) && inside(c) && !d.has(c[1] * W + c[0]))
        bad(`${p}.map.routes.${r}.spawn`, `[${c[0]}, ${c[1]}] cannot reach the exit`);
  }
}

/** Lists everything wrong with a balance document; an empty list means it is usable. */
export function validateBalance(b: unknown): string[] {
  const errs: string[] = [];
  const bad = (path: string, why: string) => errs.push(`${path}: ${why}`);
  const num = (path: string, v: unknown, min = -Infinity, int = false) => {
    if (!isNum(v)) bad(path, `expected a number, got ${JSON.stringify(v)}`);
    else if (v < min) bad(path, `must be >= ${min}, got ${v}`);
    else if (int && !Number.isInteger(v)) bad(path, `must be an integer, got ${v}`);
  };
  /** every leaf below is a finite number >= 0 */
  const leaves = (path: string, v: unknown) => {
    if (isObj(v)) for (const k of Object.keys(v)) leaves(`${path}.${k}`, v[k]);
    else num(path, v, 0);
  };
  const keys = (path: string, v: unknown, expected: string[]): v is Obj => {
    if (!isObj(v)) return (bad(path, "expected an object"), false);
    for (const k of expected) if (!(k in v)) bad(`${path}.${k}`, "missing");
    for (const k of Object.keys(v)) if (!expected.includes(k)) bad(`${path}.${k}`, "unknown key");
    return true;
  };
  const arr4 = (path: string, v: unknown) => {
    if (!Array.isArray(v) || v.length !== 4) return bad(path, "expected an array of 4 numbers");
    v.forEach((x, i) => num(`${path}[${i}]`, x, 0));
  };

  if (!isObj(b)) return ["balance: expected an object"];
  const sections = ["board", "economy", "scaling", "combat", "shooting", "projectiles", "waves"];
  for (const s of sections) if (!isObj(b[s])) bad(s, "missing section");
  if (errs.length) return errs;

  // board and levels
  num("board.enemyBlockRadius", b.board.enemyBlockRadius, 0);
  if (!isObj(b.levels) || !Object.keys(b.levels).length) bad("levels", "expected at least one level");
  else {
    const ids = Object.keys(b.levels);
    for (const [id, L] of Object.entries<Obj>(b.levels))
      validateLevel(`levels.${id}`, id, L, bad, num, id === ids[ids.length - 1]);
  }

  // plain number sections
  for (const s of ["economy", "scaling", "combat", "shooting", "projectiles"]) leaves(s, b[s]);
  if (isNum(b.economy.sellRefund) && b.economy.sellRefund > 1) bad("economy.sellRefund", "must be <= 1");
  if (isNum(b.scaling.rampLength) && b.scaling.rampLength <= 0) bad("scaling.rampLength", "must be > 0");
  if (isNum(b.projectiles.missile.pairDamageDivisor) && b.projectiles.missile.pairDamageDivisor <= 0)
    bad("projectiles.missile.pairDamageDivisor", "must be > 0");
  if (isNum(b.shooting.frost.freezeEvery) && b.shooting.frost.freezeEvery < 1)
    bad("shooting.frost.freezeEvery", "must be >= 1");

  // towers
  const hotkeys: string[] = [];
  if (keys("towers", b.towers, TOWERS)) {
    for (const t of TOWERS) {
      const d = b.towers[t],
        p = `towers.${t}`;
      if (!isObj(d)) continue;
      if (typeof d.key !== "string" || d.key.length !== 1) bad(`${p}.key`, "expected a one-character hotkey");
      else hotkeys.push(d.key);
      for (const f of ["cost", "dmg", "rate", "range"]) arr4(`${p}.${f}`, d[f]);
      for (const f of ["splash", "slow", "burn"]) if (f in d) arr4(`${p}.${f}`, d[f]);
      for (const f of ["air", "ground"]) num(`${p}.${f}`, d[f], 0);
      if (d.prio !== undefined && d.prio !== "first" && d.prio !== "strong") bad(`${p}.prio`, "expected first|strong");
      if (!isObj(d.ults) || Object.keys(d.ults).length !== 2) bad(`${p}.ults`, "expected exactly two ultimates");
      else
        for (const [u, e] of Object.entries<Obj>(d.ults)) {
          const used: string[] = [];
          for (const op of Object.keys(e)) {
            if (!["set", "mul", "div"].includes(op)) {
              bad(`${p}.ults.${u}.${op}`, "unknown operation (set|mul|div)");
              continue;
            }
            for (const [stat, v] of Object.entries<unknown>(e[op])) {
              const q = `${p}.ults.${u}.${op}.${stat}`;
              if (!STATS.includes(stat)) bad(q, "unknown tower stat");
              if (used.includes(stat)) bad(q, "a stat may appear in only one operation");
              used.push(stat);
              if (op === "set") {
                if (stat === "prio" ? v !== "first" && v !== "strong" : !isNum(v))
                  bad(q, `bad value ${JSON.stringify(v)}`);
              } else num(q, v, Number.MIN_VALUE); // mul/div by zero or a negative would break the stat
            }
          }
        }
    }
  }

  // enemies
  if (keys("enemies", b.enemies, ENEMIES))
    for (const e of ENEMIES) {
      const d = b.enemies[e];
      if (!isObj(d)) continue;
      for (const f of ["hp", "spd", "r", "gap"]) num(`enemies.${e}.${f}`, d[f], Number.MIN_VALUE);
      for (const f of ["rw", "armor"]) num(`enemies.${e}.${f}`, d[f], 0);
      if ("lives" in d) num(`enemies.${e}.lives`, d.lives, 1, true);
    }

  // difficulty
  if (keys("difficulty", b.difficulty, DIFFS))
    for (const k of DIFFS) {
      const d = b.difficulty[k];
      if (!isObj(d)) continue;
      for (const f of ["hp", "armor", "armorDiv", "spd", "rw", "credits", "lives", "ab", "gap", "mixFrom", "newFrom"])
        num(`difficulty.${k}.${f}`, d[f], f === "armor" ? 0 : Number.MIN_VALUE);
    }

  // abilities
  if (keys("abilities", b.abilities, ABILITIES)) {
    const keysUsed = [...hotkeys];
    for (const a of ABILITIES) {
      const d = b.abilities[a],
        p = `abilities.${a}`;
      if (!isObj(d)) continue;
      if (typeof d.key !== "string" || d.key.length !== 1) bad(`${p}.key`, "expected a one-character hotkey");
      else keysUsed.push(d.key);
      for (const f of ["base", "per", "cd"]) num(`${p}.${f}`, d[f], 0);
      if (![0, "circle", "row"].includes(d.aim)) bad(`${p}.aim`, "expected 0|circle|row");
      if (d.aim === "circle") num(`${p}.r`, d.r, Number.MIN_VALUE);
      for (const f of ABILITY_FIELDS[a]) num(`${p}.${f}`, d[f]);
    }
    if (new Set(keysUsed).size !== keysUsed.length) bad("hotkeys", "tower and ability hotkeys must be unique");
  }

  // waves (needs the enemy names above)
  const w = b.waves;
  for (const f of ["maxActive", "alternateUntil", "bossEvery"]) num(`waves.${f}`, w[f], 1, true);
  num("waves.capRetry", w.capRetry, 0.1);
  if (!Array.isArray(w.bothEvery) || !w.bothEvery.length) bad("waves.bothEvery", "expected a list of integers");
  else w.bothEvery.forEach((k: unknown, i: number) => num(`waves.bothEvery[${i}]`, k, 1, true));
  for (const f of ["cycle", "cycleNew"]) {
    if (!Array.isArray(w[f]) || !w[f].length) bad(`waves.${f}`, "expected a non-empty list of enemy types");
    else
      w[f].forEach((e: string, i: number) => {
        if (!ENEMIES.includes(e) || e === "boss" || e === "queen") bad(`waves.${f}[${i}]`, `bad enemy "${e}"`);
        else if (!isObj(w.counts) || !isObj(w.counts[e]))
          bad(`waves.counts.${e}`, "no count formula for an enemy used in a cycle");
      });
  }
  if (isObj(w.counts))
    for (const [e, c] of Object.entries<Obj>(w.counts)) {
      num(`waves.counts.${e}.base`, c?.base, 0);
      num(`waves.counts.${e}.divisor`, c?.divisor, Number.MIN_VALUE);
    }
  if (isObj(w.caps)) {
    num("waves.caps.default", w.caps.default, 1);
    for (const [e, v] of Object.entries(w.caps)) num(`waves.caps.${e}`, v, 1);
  } else bad("waves.caps", "missing");
  for (const s of ["boss", "final", "mixedFlyers", "escortHealers", "gap"]) leaves(`waves.${s}`, w[s]);
  return errs;
}

export function parseBalance(data: unknown): Balance {
  const errs = validateBalance(data);
  if (errs.length) throw new Error("Invalid balance data:\n" + errs.map((e) => "  " + e).join("\n"));
  return data as Balance;
}

/** The game's default numbers. */
export const BALANCE: Balance = parseBalance(raw);
