// Damage, status effects and the consequences of death or escape.
import type { Creep, Game, Vec } from "./types";

/** Position of a creep including its drawing offset inside the cell. */
export const ex = (c: Creep): number => c.x + c.ox;
export const ey = (c: Creep): number => c.y + c.oy;
export const pos = (c: Creep): Vec => [ex(c), ey(c)];

export function ignite(g: Game, c: Creep, burn: number, plague?: boolean): void {
  if (c.dead) return;
  c.burn = Math.max(c.burnT > 0 ? c.burn : 0, burn);
  c.burnT = g.B.combat.burnDuration;
  if (plague) c.plague = true;
}

export function stun(g: Game, c: Creep, t: number): void {
  if ((c.stunImm ?? 0) > 0) return;
  const k = g.B.combat;
  const d = c.boss ? t * k.stunBossFactor : t;
  c.stunT = Math.max(c.stunT, d);
  c.stunImm = d + (c.boss ? k.stunImmunityBoss : k.stunImmunity);
}

/** Armor takes `armor` points off a hit but never more than the armor floor allows; `pierce` ignores it. */
export function hit(g: Game, c: Creep, dmg: number, pierce: boolean): void {
  if (c.dead) return;
  if (c.vulnT > 0) dmg *= 1 + c.vuln;
  if (!pierce) dmg = Math.max(dmg * g.B.combat.armorFloor, dmg - c.armor);
  c.hp -= dmg;
  if (c.hp <= 0) kill(g, c);
}

/** Damage everything within r (full near the centre, reduced towards the edge); flyers only if `air`. */
export function areaHit(
  g: Game,
  x: number,
  y: number,
  r: number,
  dmg: number,
  pierce: boolean,
  air: boolean,
  extra?: ((c: Creep) => void) | null,
): void {
  const k = g.B.combat;
  for (const c of g.S.creeps) {
    if (c.dead || (c.fly && !air)) continue;
    const q = Math.hypot(ex(c) - x, ey(c) - y);
    if (q > r + c.r * k.splashPad) continue;
    hit(g, c, dmg * (q < r * k.splashCore ? 1 : k.splashEdge), pierce);
    if (extra) extra(c);
  }
}

/** A creep of wave n is gone (killed or leaked); when the whole wave is, pay the clear bonus. */
function waveTick(g: Game, n: number): void {
  const S = g.S;
  if (--S.left[n] === 0) {
    if (n === g.L.finalWave) {
      if (S.lives > 0) endGame(g, true);
      return;
    }
    const b = g.B.economy.waveClearBonus.base + g.B.economy.waveClearBonus.perWave * n;
    S.credits += b;
    g.emit({ type: "toast", key: "cleared", vars: { n, b } });
  }
}

export function leak(g: Game, c: Creep): void {
  if (c.dead) return;
  const S = g.S;
  c.dead = true;
  S.lives -= g.B.enemies[c.type].lives || 1;
  g.emit({ type: "leak", creep: c });
  if (S.lives <= 0) {
    S.lives = 0;
    endGame(g, false);
    return;
  }
  waveTick(g, c.wave);
}

export function kill(g: Game, c: Creep): void {
  if (c.dead) return;
  const S = g.S;
  c.dead = true;
  S.credits += c.rw;
  S.score += c.rw * g.B.economy.score.perReward + S.wave * g.B.economy.score.perWave;
  g.emit({ type: "kill", creep: c, x: ex(c), y: ey(c) });
  waveTick(g, c.wave);
}

export function endGame(g: Game, won: boolean): void {
  if (g.S.over) return;
  g.S.over = true;
  g.S.won = won;
  g.emit({ type: "end", won });
}
