// The tutorial script: tutorial.yaml, checked at startup like balance.yaml (a typo fails loudly), and the names of
// the texts it needs.
import raw from "./tutorial.yaml";
import type { Balance } from "../game/types";
import type { Script } from "./types";

const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const NEEDS = [
  "towers",
  "wave",
  "pathLength",
  "creeps",
  "timer",
  "credits",
  "upgrades",
  "ultimates",
  "overclocks",
  "earlyCalls",
  "pathGain",
];
const COUNTERS = ["upgrades", "ultimates", "overclocks", "earlyCalls"];

const pascal = (id: string) => id.replace(/(^|-)([a-z0-9])/g, (_, __, c: string) => c.toUpperCase());
/** The text of a step: `build-gun` is `tutBuildGun` in texts.<lang>.json (ui). */
export const stepKey = (id: string) => "tut" + pascal(id);
/** The text of a tip: `armored` is `tutHintArmored`. */
export const hintKey = (id: string) => "tutHint" + pascal(id);

type Obj = Record<string, any>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

/** What is wrong with a script, as a list of "path: reason" (empty when it is fine). `B` is the game's balance. */
export function validateScript(s: unknown, B: Pick<Balance, "levels" | "difficulty" | "enemies">): string[] {
  const errs: string[] = [];
  const bad = (p: string, why: string) => errs.push(`${p}: ${why}`);
  if (!isObj(s)) return ["tutorial: expected an object"];
  if (typeof s.level !== "string" || !Object.hasOwn(B.levels, s.level)) bad("level", "not a level of the game");
  if (typeof s.difficulty !== "string" || !Object.hasOwn(B.difficulty, s.difficulty))
    bad("difficulty", "not a difficulty");
  if (typeof s.earlyTimer !== "number" || !(s.earlyTimer >= 0)) bad("earlyTimer", "expected seconds >= 0");
  const ids = new Set<string>();
  const unique = (p: string, id: unknown) => {
    if (typeof id !== "string" || !KEBAB.test(id)) return bad(p, "the id must be lower-case words joined by -");
    if (ids.has(id)) bad(p, `the id "${id}" is used twice`);
    ids.add(id);
  };

  if (!Array.isArray(s.steps) || !s.steps.length) bad("steps", "expected a non-empty list");
  else
    s.steps.forEach((st: Obj, i: number) => {
      const p = `steps[${i}]`;
      unique(`${p}.id`, st?.id);
      const u = st?.until;
      if (u === "next") void 0;
      else if (!isObj(u) || !Object.keys(u).length) bad(`${p}.until`, 'expected "next" or numbers to reach');
      else
        for (const [k, n] of Object.entries(u)) {
          if (!NEEDS.includes(k)) bad(`${p}.until.${k}`, "unknown number");
          else if (typeof n !== "number" || !Number.isFinite(n) || n < 0)
            bad(`${p}.until.${k}`, "expected a number >= 0");
        }
      for (const k of st?.fresh ?? []) if (!COUNTERS.includes(k)) bad(`${p}.fresh`, `"${k}" is not a counter`);
      const t = st?.target;
      if (t !== undefined) {
        const kinds = isObj(t) ? Object.keys(t) : [];
        if (kinds.length !== 1 || !["selector", "cells", "gates"].includes(kinds[0]))
          bad(`${p}.target`, "expected one of selector, cells, gates");
        else if (kinds[0] === "selector" && (typeof t.selector !== "string" || !t.selector))
          bad(`${p}.target.selector`, "expected a selector");
        else if (
          kinds[0] === "cells" &&
          !(
            Array.isArray(t.cells) &&
            t.cells.length &&
            t.cells.every((c: unknown) => Array.isArray(c) && c.length === 2 && c.every(Number.isInteger))
          )
        )
          bad(`${p}.target.cells`, "expected a list of [x, y] cells");
        else if (kinds[0] === "gates" && t.gates !== true) bad(`${p}.target.gates`, "expected true");
      }
    });

  const hintIds = new Set<string>();
  if (!Array.isArray(s.hints)) bad("hints", "expected a list");
  else
    s.hints.forEach((h: Obj, i: number) => {
      const p = `hints[${i}]`;
      if (typeof h?.id !== "string" || !KEBAB.test(h.id)) bad(`${p}.id`, "the id must be lower-case words joined by -");
      else if (hintIds.has(h.id)) bad(`${p}.id`, `the id "${h.id}" is used twice`);
      else hintIds.add(h.id);
      if (typeof h?.seconds !== "number" || !(h.seconds > 0)) bad(`${p}.seconds`, "expected seconds > 0");
      if (h?.times !== undefined && !(Number.isInteger(h.times) && h.times >= 1))
        bad(`${p}.times`, "expected a whole number >= 1");
      const w = h?.when;
      if (isObj(w) && typeof w.enemy === "string") {
        if (!Object.hasOwn(B.enemies, w.enemy)) bad(`${p}.when.enemy`, `"${w.enemy}" is not an enemy of the game`);
      } else if (isObj(w) && isObj(w.idle)) {
        for (const k of ["creeps", "timer", "earlyCalls"])
          if (typeof w.idle[k] !== "number" || w.idle[k] < 0) bad(`${p}.when.idle.${k}`, "expected a number >= 0");
      } else bad(`${p}.when`, "expected { enemy } or { idle: { creeps, timer, earlyCalls } }");
    });
  return errs;
}

/** The script of the game, the same everywhere (the interface, the tests). */
export const SCRIPT = raw as unknown as Script;
