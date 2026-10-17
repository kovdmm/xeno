// How each kind of projectile flies and what it does on arrival. Adding a kind: a type in types.ts and an
// entry in UPDATE below.
import { areaHit, ex, ey, hit, ignite, stun } from "./combat";
import type { Bullet, Game, Howitzer, Missile, Plasma, Projectile, ProjKind, Shell } from "./types";

type Updater<P extends Projectile> = (g: Game, p: P, dt: number) => void;

/** A shell lands: splash damage, optionally scattering bomblets (the cluster ultimate). */
function explode(g: Game, p: Shell): void {
  areaHit(g, p.tx, p.ty, p.sp, p.dmg, p.pierce, false, p.stun ? (c) => stun(g, c, p.stun!) : null);
  g.emit({
    type: "explode",
    kind: p.src === "bomblet" ? "bomblet" : "shell",
    x: p.tx,
    y: p.ty,
    r: p.sp,
  });
  if (p.cluster) {
    const bm = g.B.projectiles.shell.bomblet;
    for (let k = 0; k < p.cluster; k++) {
      const a = g.rand() * 6.28,
        r = bm.scatterMin + g.rand() * bm.scatterRange;
      g.S.proj.push({
        k: "s",
        src: "bomblet",
        x: p.tx,
        y: p.ty,
        tgt: null,
        tx: p.tx + Math.cos(a) * r,
        ty: p.ty + Math.sin(a) * r,
        dmg: p.dmg * bm.damageFraction,
        sp: bm.splash,
        spd: bm.speed,
        big: false,
        pierce: p.pierce,
      });
    }
  }
}

/** machine-gun bullet: straight to the target */
const bullet: Updater<Bullet> = (g, p, dt) => {
  if (p.tgt.dead) {
    p.dead = true;
    return;
  }
  const dx = ex(p.tgt) - p.x,
    dy = ey(p.tgt) - p.y,
    d = Math.hypot(dx, dy),
    s = p.spd * dt;
  if (d <= s + g.B.projectiles.bullet.hitRadius) {
    hit(g, p.tgt, p.dmg, p.pierce);
    p.dead = true;
    return;
  }
  p.x += (dx / d) * s;
  p.y += (dy / d) * s;
};

/** cannon shell or bomblet: flies to a point (following the target while it lives), then explodes */
const shell: Updater<Shell> = (g, p, dt) => {
  if (p.tgt && !p.tgt.dead) {
    p.tx = ex(p.tgt);
    p.ty = ey(p.tgt);
  }
  const dx = p.tx - p.x,
    dy = p.ty - p.y,
    d = Math.hypot(dx, dy),
    s = p.spd * dt;
  if (d <= s) {
    p.dead = true;
    explode(g, p);
    return;
  }
  p.x += (dx / d) * s;
  p.y += (dy / d) * s;
};

/** homing missile: turns towards the target, retargets the nearest creep it can hit if it dies */
const missile: Updater<Missile> = (g, p, dt) => {
  const M = g.B.projectiles.missile;
  p.life -= dt;
  if (p.life <= 0) {
    p.dead = true;
    return;
  }
  if (p.tgt.dead) {
    let b = null,
      bd = M.retargetRange * M.retargetRange;
    for (const c of g.S.creeps) {
      if (c.dead || !(c.fly ? p.air : p.ground)) continue;
      const q = (ex(c) - p.x) ** 2 + (ey(c) - p.y) ** 2;
      if (q < bd) {
        bd = q;
        b = c;
      }
    }
    if (!b) {
      p.dead = true;
      return;
    }
    p.tgt = b;
  }
  const dx = ex(p.tgt) - p.x,
    dy = ey(p.tgt) - p.y,
    d = Math.hypot(dx, dy);
  let da = Math.atan2(dy, dx) - p.ang;
  while (da > Math.PI) da -= 6.283;
  while (da < -Math.PI) da += 6.283;
  p.ang += da * Math.min(1, dt * M.turnRate);
  p.v = Math.min(M.maxSpeed, p.v + dt * M.accel);
  const s = p.v * dt;
  if (d <= s + M.hitRadius) {
    if (p.sp) areaHit(g, p.x, p.y, p.sp, p.dmg, p.pierce, true);
    else hit(g, p.tgt, p.dmg, p.pierce);
    p.dead = true;
    g.emit({ type: "explode", kind: "missile", x: p.x, y: p.y, r: p.sp || M.defaultBlast });
    return;
  }
  p.x += Math.cos(p.ang) * s;
  p.y += Math.sin(p.ang) * s;
};

/** plasma bolt: ignites the target; the nova ultimate also ignites everything around it */
const plasma: Updater<Plasma> = (g, p, dt) => {
  const P = g.B.projectiles.plasma;
  if (p.tgt.dead) {
    p.dead = true;
    return;
  }
  const dx = ex(p.tgt) - p.x,
    dy = ey(p.tgt) - p.y,
    d = Math.hypot(dx, dy),
    s = p.spd * dt;
  if (d <= s + P.hitRadius) {
    const c = p.tgt;
    hit(g, c, p.dmg, p.pierce);
    ignite(g, c, p.burn, !!p.plague);
    if (p.nova)
      areaHit(g, p.x, p.y, p.nova, p.dmg * P.novaDamageFraction, p.pierce, true, (e) => ignite(g, e, p.burn, false));
    g.emit({ type: "explode", kind: "plasma", x: p.x, y: p.y, r: p.nova || P.defaultBlast });
    p.dead = true;
    return;
  }
  p.x += (dx / d) * s;
  p.y += (dy / d) * s;
};

/** howitzer shell: a lob that lands after `dur` seconds, whatever happens to the target */
const howitzer: Updater<Howitzer> = (g, p, dt) => {
  if (p.tgt && !p.tgt.dead) {
    p.tx = ex(p.tgt);
    p.ty = ey(p.tgt);
  }
  p.f += dt / p.dur;
  const f = Math.max(0, Math.min(1, p.f));
  p.x = p.sx + (p.tx - p.sx) * f;
  p.y = p.sy + (p.ty - p.sy) * f;
  p.h = Math.sin(Math.PI * f) * g.B.projectiles.howitzer.arcHeight;
  if (p.f >= 1) {
    p.dead = true;
    areaHit(g, p.tx, p.ty, p.sp, p.dmg, true, false);
    g.emit({ type: "explode", kind: p.nuke ? "nukeShell" : "artillery", x: p.tx, y: p.ty, r: p.sp });
  }
};

const UPDATE: { [K in ProjKind]: Updater<Extract<Projectile, { k: K }>> } = {
  b: bullet,
  s: shell,
  m: missile,
  pl: plasma,
  a: howitzer,
};

export function updateProjectile(g: Game, p: Projectile, dt: number): void {
  (UPDATE[p.k] as Updater<Projectile>)(g, p, dt);
}
