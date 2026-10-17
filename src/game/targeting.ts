// Choosing and aiming at targets.
import { INF } from "./constants";
import { ex, ey } from "./combat";
import { progress } from "./movement";
import type { Creep, Game, Tower, TowerStats } from "./types";

export const canHit = (s: Pick<TowerStats, "air" | "ground">, c: Creep): boolean => !!(c.fly ? s.air : s.ground);

/** Is creep c within radius r of tower t? */
export function inR(t: Tower, c: Creep, r: number): boolean {
  const dx = ex(c) - t.x,
    dy = ey(c) - t.y;
  return dx * dx + dy * dy <= r * r;
}

/** Best creep in range: the one closest to the exit, or the toughest for `prio: "strong"`. */
export function findTarget(g: Game, t: Tower, s: TowerStats, skip?: Creep[] | null): Creep | null {
  let b: Creep | null = null,
    bp = INF;
  for (const c of g.S.creeps) {
    if (c.dead || !canHit(s, c) || !inR(t, c, s.range) || (skip && skip.includes(c))) continue;
    if (s.minR && inR(t, c, s.minR)) continue;
    const p = s.prio === "strong" ? -c.hp : progress(g, c);
    if (p < bp) {
      bp = p;
      b = c;
    }
  }
  return b;
}

/** Up to n different targets, best first. */
export function findTargets(g: Game, t: Tower, s: TowerStats, n: number): Creep[] {
  const a: Creep[] = [];
  while (a.length < n) {
    const c = findTarget(g, t, s, a);
    if (!c) break;
    a.push(c);
  }
  return a;
}

/** Turns the tower towards creep c, at a finite speed. */
export function aimAt(g: Game, t: Tower, c: Creep, dt: number): void {
  const ta = Math.atan2(ey(c) - t.y, ex(c) - t.x);
  let da = ta - t.ang;
  while (da > Math.PI) da -= 6.283;
  while (da < -Math.PI) da += 6.283;
  t.ang += da * Math.min(1, dt * g.B.shooting.aimRate);
}
