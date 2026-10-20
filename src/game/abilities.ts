// Player abilities: pricing, casting and their runtime (meteors, fire zones, bombers, nukes).
import { cos, sin, hypot } from "./dmath";
import { areaHit, ex, ey, hit } from "./combat";
import { unitHP } from "./rules";
import type { AbilityKey, CastResult, Game, Vec } from "./types";

export const abCost = (g: Game, k: AbilityKey): number =>
  Math.round((g.B.abilities[k].base + g.B.abilities[k].per * Math.max(1, g.S.wave)) * g.D().ab);

/* Returns {ok:true} or {ok:false, code:'cd'|'noCred'|'over', s:secondsLeft}. `pt` is in board units (cell edges). */
export function cast(g: Game, k: AbilityKey, pt?: Vec): CastResult {
  const S = g.S,
    A = g.B.abilities[k],
    cost = abCost(g, k);
  if (S.over) return { ok: false, code: "over" };
  if (S.cd[k] > 0) return { ok: false, code: "cd", s: Math.ceil(S.cd[k]) };
  if (S.credits < cost) return { ok: false, code: "noCred" };
  S.credits -= cost;
  S.cd[k] = A.cd;
  const U = unitHP(g.B, g.D(), S.wave);
  // game positions use cell centres
  const p: Vec | undefined = pt ? [pt[0] - 0.5, pt[1] - 0.5] : undefined;
  if (k === "stasis") {
    for (const c of S.creeps) {
      if (c.dead) continue;
      c.slow = Math.max(c.slowT > 0 ? c.slow : 0, c.boss ? A.bossSlow! : A.slow!);
      c.slowT = A.duration!;
    }
    S.stasisT = A.duration!;
  } else if (k === "meteor") {
    for (let i = 0; i < A.count!; i++) {
      const a = g.rand() * 6.28,
        r = Math.sqrt(g.rand()) * A.r!;
      S.meteors.push({
        kind: "meteor",
        x: p![0] + cos(a) * r,
        y: p![1] + sin(a) * r,
        t: i * A.interval!,
        fall: A.fall!,
        dmg: A.damageUnits! * U,
        r: A.impactRadius!,
      });
    }
  } else if (k === "napalm") {
    S.zones.push({
      x: p![0],
      y: p![1],
      r: A.r!,
      t: A.duration!,
      max: A.duration!,
      dps: A.dpsUnits! * U,
    });
  } else if (k === "carpet") {
    S.bombers.push({ x: A.startX!, y: Math.round(p![1]), next: 0, dmg: A.damageUnits! * U });
  } else if (k === "nuke") {
    S.nukes.push({ x: p![0], y: p![1], t: A.delay!, r: A.r!, dmg: A.damageUnits! * U });
  }
  g.emit({ type: "cast", ability: k, pt: p });
  return { ok: true };
}

/** Cooldowns and everything the abilities have put on the field. */
export function stepAbilities(g: Game, dt: number): void {
  const S = g.S,
    W = g.L.width,
    CARPET = g.B.abilities.carpet,
    NUKE = g.B.abilities.nuke;
  for (const k of Object.keys(g.B.abilities) as AbilityKey[]) if (S.cd[k] > 0) S.cd[k] = Math.max(0, S.cd[k] - dt);
  if (S.stasisT > 0) S.stasisT -= dt;
  for (const m of S.meteors) {
    m.t -= dt;
    if (m.t <= -m.fall && !m.done) {
      m.done = true;
      areaHit(g, m.x, m.y, m.r, m.dmg, true, true);
      g.emit({ type: "explode", kind: m.kind, x: m.x, y: m.y, r: m.r });
    }
  }
  S.meteors = S.meteors.filter((m) => !m.done);
  for (const z of S.zones) {
    z.t -= dt;
    for (const c of S.creeps) {
      if (c.dead || c.fly) continue;
      if (hypot(ex(c) - z.x, ey(c) - z.y) <= z.r) hit(g, c, z.dps * dt, true);
    }
  }
  S.zones = S.zones.filter((z) => z.t > 0);
  for (const b of S.bombers) {
    b.x += CARPET.speed! * dt;
    while (b.next <= b.x && b.next <= W) {
      S.meteors.push({
        kind: "bomb",
        x: b.next,
        y: b.y + (g.rand() - 0.5) * CARPET.spread!,
        t: 0,
        fall: CARPET.fall!,
        dmg: b.dmg,
        r: CARPET.impactRadius!,
      });
      b.next += CARPET.bombInterval!;
    }
  }
  S.bombers = S.bombers.filter((b) => b.x < W + CARPET.exitMargin!);
  for (const n of S.nukes) {
    n.t -= dt;
    if (n.t <= 0 && !n.done) {
      n.done = true;
      for (const c of S.creeps) {
        if (c.dead) continue;
        if (hypot(ex(c) - n.x, ey(c) - n.y) <= n.r + c.r)
          hit(g, c, c.max * (c.boss ? NUKE.bossHpFraction! : NUKE.hpFraction!) + n.dmg, true);
      }
      g.emit({ type: "explode", kind: "nuke", x: n.x, y: n.y, r: n.r });
    }
  }
  S.nukes = S.nukes.filter((n) => !n.done);
}
