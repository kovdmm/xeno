// What each tower type does on its turn. To add a tower: a row in data/towers.ts plus one entry here
// (a `shooter` that fires projectiles/beams, or a `continuous` one that acts every tick).
import { ex, ey, hit, stun } from "./combat";
import { aimAt, findTarget, findTargets, inR } from "./targeting";
import { statsOf } from "./rules";
import type { Creep, Game, Tower, TowerStats, TowerType } from "./types";

type Shooter = (g: Game, t: Tower, s: TowerStats, c: Creep, big: boolean) => void;
type Continuous = (g: Game, t: Tower, s: TowerStats, dt: number) => void;

/** Called once per shot with the first target; a tower may fire several shots per tick when it is fast. */
const SHOOTERS: Partial<Record<TowerType, Shooter>> = {
  gun(g, t, s, c, big) {
    const P = g.B.projectiles.bullet;
    g.S.proj.push({
      k: "b",
      x: t.x + Math.cos(t.ang) * P.muzzle,
      y: t.y + Math.sin(t.ang) * P.muzzle,
      tgt: c,
      dmg: s.dmg,
      spd: s.prio === "strong" ? P.strongSpeed : P.speed,
      big,
      pierce: s.pierce,
    });
  },

  cannon(g, t, s, c, big) {
    const P = g.B.projectiles.shell;
    g.S.proj.push({
      k: "s",
      src: "cannon",
      x: t.x + Math.cos(t.ang) * P.muzzle,
      y: t.y + Math.sin(t.ang) * P.muzzle,
      tgt: c,
      tx: ex(c),
      ty: ey(c),
      dmg: s.dmg,
      sp: s.splash,
      spd: P.speed,
      big,
      pierce: s.pierce,
      cluster: s.cluster,
      stun: s.stun,
    });
  },

  missile(g, t, s, c) {
    const P = g.B.projectiles.missile;
    const targets = s.multi ? findTargets(g, t, s, s.multi) : [c, c];
    targets.forEach((target, k) => {
      const side = k % 2 ? 1 : -1;
      g.S.proj.push({
        k: "m",
        x: t.x + Math.cos(t.ang + side * P.sideAngle) * P.sideOffset,
        y: t.y + Math.sin(t.ang + side * P.sideAngle) * P.sideOffset,
        tgt: target,
        dmg: s.multi ? s.dmg : s.dmg / P.pairDamageDivisor,
        v: P.speed,
        ang: t.ang + side * (P.spread + k * P.spreadStep),
        life: P.life,
        pierce: s.pierce,
        air: s.air,
        ground: s.ground,
        sp: s.splash,
      });
    });
  },

  plasma(g, t, s, c, big) {
    const P = g.B.projectiles.plasma;
    g.S.proj.push({
      k: "pl",
      x: t.x + Math.cos(t.ang) * P.muzzle,
      y: t.y + Math.sin(t.ang) * P.muzzle,
      tgt: c,
      dmg: s.dmg,
      burn: s.burn,
      spd: P.speed,
      big,
      pierce: s.pierce,
      nova: s.nova,
      plague: s.plague,
    });
  },

  /** instant hit along a line, through everything */
  rail(g, t, s, c, big) {
    const a = Math.atan2(ey(c) - t.y, ex(c) - t.x);
    t.ang = a;
    const x2 = t.x + Math.cos(a) * s.range,
      y2 = t.y + Math.sin(a) * s.range;
    for (const e of g.S.creeps) {
      if (e.dead) continue;
      const px = ex(e) - t.x,
        py = ey(e) - t.y,
        proj = px * Math.cos(a) + py * Math.sin(a);
      if (proj < 0 || proj > s.range) continue;
      if (Math.abs(-px * Math.sin(a) + py * Math.cos(a)) <= e.r + g.B.projectiles.rail.halfWidth * s.width)
        hit(g, e, s.dmg, true);
    }
    g.emit({ type: "rail", tower: t, x: t.x, y: t.y, x2, y2, width: s.width, big });
  },

  artillery(g, t, s, c) {
    const P = g.B.projectiles.howitzer;
    const targets = s.multi ? findTargets(g, t, s, s.multi) : [c];
    const ox = t.x + Math.cos(t.ang) * P.muzzle,
      oy = t.y + Math.sin(t.ang) * P.muzzle;
    targets.forEach((target, k) => {
      g.S.proj.push({
        k: "a",
        x: ox,
        y: oy,
        sx: ox,
        sy: oy,
        tgt: target,
        tx: ex(target),
        ty: ey(target),
        f: -k * P.stagger,
        dur: P.flightTime,
        h: 0,
        dmg: s.dmg,
        sp: s.splash,
        pierce: true,
        nuke: s.splash > P.nukeSplash,
      });
    });
    g.emit({ type: "muzzle", tower: t, x: ox, y: oy });
  },
};

/** Towers that do not wait for a cooldown shot: they act on every tick. */
const CONTINUOUS: Partial<Record<TowerType, Continuous>> = {
  /** a beam on up to `beams` targets; the heat ultimate ramps damage up on a single target */
  laser(g, t, s, dt) {
    const prev = (t.tgts || []).filter((c) => !c.dead && inR(t, c, s.range)).slice(0, s.beams);
    while (prev.length < s.beams) {
      const c = findTarget(g, t, s, prev);
      if (!c) break;
      prev.push(c);
    }
    if (s.heat) {
      if (prev[0] && prev[0] === t.heatTgt) t.heatT = (t.heatT ?? 0) + dt;
      else {
        t.heatT = 0;
        t.heatTgt = prev[0] || null;
      }
    }
    const mult = s.heat ? 1 + g.B.shooting.laserHeatBonus * Math.min(1, t.heatT! / s.heat) : 1;
    t.heatM = mult;
    t.tgts = prev;
    if (prev.length) {
      aimAt(g, t, prev[0], dt);
      t.beam = prev;
      for (const c of prev) hit(g, c, s.dmg * mult * dt, true);
    }
  },

  /** a pulse that slows (and with the ultimates freezes or weakens) everything in range */
  frost(g, t, s) {
    if (t.cd > 0) return;
    const F = g.B.shooting.frost;
    let any = false;
    t.pulse = (t.pulse || 0) + 1;
    const freeze = s.freeze && t.pulse % F.freezeEvery === 0;
    for (const c of g.S.creeps) {
      if (c.dead || !inR(t, c, s.range)) continue;
      any = true;
      c.slow = Math.max(c.slowT > 0 ? c.slow : 0, s.slow);
      c.slowT = F.slowTime;
      if (s.vuln) {
        c.vuln = Math.max(c.vulnT > 0 ? c.vuln : 0, s.vuln);
        c.vulnT = F.vulnTime;
      }
      if (freeze) stun(g, c, s.freeze!);
      hit(g, c, s.dmg, s.pierce);
    }
    if (any) {
      t.cd = Math.max(t.cd + s.rate, s.rate * F.minCooldown);
      g.emit({ type: "pulse", tower: t, r: s.range, freeze: !!freeze });
    } else {
      t.cd = 0;
      t.pulse--;
    }
  },
};

/** One tick of one tower. */
export function updateTower(g: Game, t: Tower, dt: number): void {
  const s = statsOf(g.B, t);
  t.cd -= dt;
  t.beam = null;
  const continuous = CONTINUOUS[t.type];
  if (continuous) return continuous(g, t, s, dt);
  const c = findTarget(g, t, s);
  if (!c) {
    if (t.cd < 0) t.cd = 0;
    return;
  }
  aimAt(g, t, c, dt);
  if (t.cd > 0) return;
  const big = t.lvl >= 4;
  g.emit({ type: "shot", tower: t });
  for (let shot = 0; t.cd <= 0 && shot < g.B.shooting.maxShotsPerTick; shot++) {
    t.cd += s.rate;
    SHOOTERS[t.type]!(g, t, s, c, big);
  }
  if (t.cd < 0) t.cd = 0;
}
