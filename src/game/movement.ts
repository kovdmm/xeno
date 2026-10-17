// Creep movement along the pathfinding field, plus the per-creep abilities that act while walking
// (burning, healing, blinking).
import { ex, ey, hit, ignite, leak } from "./combat";
import { pickNext } from "./grid";
import { exitDir } from "./level";
import type { Creep, Game } from "./types";

/** How far a creep still has to go: smaller is closer to the exit. */
export function progress(g: Game, c: Creep): number {
  if (c.fly) return Math.hypot(c.gx - c.x, c.gy - c.y);
  if (c.ti < 0) return 0;
  return g.S.fields[c.route][c.ti] + Math.hypot(c.tx - c.x, c.ty - c.y);
}

/** Walks `sp` cells along the field, turning at cell centres. */
export function travel(g: Game, c: Creep, sp: number): void {
  const { width: W } = g.L;
  let guard = 0;
  while (sp > 0 && !c.dead && guard++ < 12) {
    const dx = c.tx - c.x,
      dy = c.ty - c.y,
      d = Math.hypot(dx, dy);
    if (d > sp) {
      c.x += (dx / d) * sp;
      c.y += (dy / d) * sp;
      break;
    }
    c.x = c.tx;
    c.y = c.ty;
    sp -= d;
    if (c.leaving) {
      leak(g, c);
      return;
    }
    const X = exitDir(g.L, c.route),
      f = g.S.fields[c.route],
      i = c.ty * W + c.tx;
    if (f[i] === 0) {
      c.ci = i;
      c.ti = -1;
      c.tx += X[0];
      c.ty += X[1];
      c.dx = X[0];
      c.dy = X[1];
      c.leaving = true;
      continue;
    }
    const nx = pickNext(g, f, c.tx, c.ty, c.dx, c.dy);
    if (!nx) break;
    c.dx = nx[0] - c.tx;
    c.dy = nx[1] - c.ty;
    c.ci = i;
    c.tx = nx[0];
    c.ty = nx[1];
    c.ti = nx[1] * W + nx[0];
  }
}

export function moveCreep(g: Game, c: Creep, dt: number): void {
  const S = g.S,
    K = g.B.combat;
  if (c.burnT > 0) {
    c.burnT -= dt;
    hit(g, c, c.burn * dt, true);
    if (c.dead) return;
    if (c.plague) {
      c.spreadT = (c.spreadT || 0) - dt;
      if (c.spreadT <= 0) {
        c.spreadT = K.plague.interval;
        for (const e of S.creeps) {
          if (e === c || e.dead) continue;
          if (Math.hypot(ex(e) - ex(c), ey(e) - ey(c)) < K.plague.radius && (e.burnT <= 0 || e.burn < c.burn))
            ignite(g, e, c.burn, true);
        }
      }
    }
  } else c.plague = false;
  if (c.slowT > 0) c.slowT -= dt;
  if (c.vulnT > 0) c.vulnT -= dt;
  if ((c.stunImm ?? 0) > 0) c.stunImm! -= dt;
  if (c.stunT > 0) {
    c.stunT -= dt;
    return;
  }
  const sp = c.spd * (c.slowT > 0 ? 1 - c.slow : 1) * dt;
  if (c.fly) {
    const dx = c.gx - c.x,
      dy = c.gy - c.y,
      d = Math.hypot(dx, dy);
    if (d <= sp) {
      leak(g, c);
      return;
    }
    c.x += (dx / d) * sp;
    c.y += (dy / d) * sp;
    return;
  }
  if (c.type === "healer") {
    c.healT -= dt;
    if (c.healT <= 0) {
      c.healT = K.healer.interval;
      // Healing does not stack: each creep takes at most one heal per interval.
      for (const e of S.creeps) {
        if (e.dead || e.hp >= e.max || (e.healedAt || -1) > S.t - K.healer.window) continue;
        if (Math.hypot(ex(e) - ex(c), ey(e) - ey(c)) <= K.healer.radius) {
          e.hp = Math.min(e.max, e.hp + e.max * (e === c ? K.healer.selfHeal : K.healer.allyHeal));
          e.healedAt = S.t;
        }
      }
      g.emit({ type: "heal", x: ex(c), y: ey(c), r: K.healer.radius });
    }
  }
  if (c.type === "blinker" && !c.leaving) {
    c.blinkT -= dt;
    if (c.blinkT <= 0) {
      c.blinkT = K.blinker.interval;
      const x0 = ex(c),
        y0 = ey(c);
      travel(g, c, K.blinker.distance);
      if (c.dead) return;
      g.emit({ type: "blink", x: x0, y: y0, x2: ex(c), y2: ey(c) });
    }
  }
  travel(g, c, sp);
  const ta = Math.atan2(c.dy, c.dx);
  let da = ta - c.ang;
  while (da > Math.PI) da -= 6.283;
  while (da < -Math.PI) da += 6.283;
  c.ang += da * Math.min(1, dt * K.creepTurnRate);
}
