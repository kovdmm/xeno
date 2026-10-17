// The game's numbers live in data/balance.json. This module types and validates that file, so a typo in
// the JSON fails loudly at startup (and in tests) instead of producing NaN deep inside the simulation.
import raw from "./data/balance.json";
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

  // board
  const { width, height, routes } = b.board;
  num("board.width", width, 1, true);
  num("board.height", height, 1, true);
  num("board.finalWave", b.board.finalWave, 1, true);
  num("board.enemyBlockRadius", b.board.enemyBlockRadius, 0);
  if (keys("board.routes", routes, ["h", "v"]))
    for (const r of ["h", "v"]) {
      const R = routes[r];
      if (!isObj(R)) continue;
      for (const f of ["spawn", "exit"]) {
        if (!Array.isArray(R[f]) || !R[f].length) bad(`board.routes.${r}.${f}`, "expected a non-empty list of cells");
        else
          R[f].forEach((c: unknown, i: number) => {
            const ok = Array.isArray(c) && c.length === 2 && isNum(c[0]) && isNum(c[1]);
            if (!ok) return bad(`board.routes.${r}.${f}[${i}]`, "expected [x, y]");
            const [x, y] = c as number[];
            if (x < 0 || y < 0 || x >= width || y >= height) bad(`board.routes.${r}.${f}[${i}]`, "outside the board");
          });
      }
      if (!Array.isArray(R.dir) || R.dir.length !== 2 || Math.abs(R.dir[0]) + Math.abs(R.dir[1]) !== 1)
        bad(`board.routes.${r}.dir`, "expected a unit step like [1, 0]");
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
  for (const f of ["alternateUntil", "bossEvery"]) num(`waves.${f}`, w[f], 1, true);
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
