// Wave composition, spawning and the wave timer. Every number comes from balance.waves / scaling / combat.
import { mid } from "./constants";
import { diffHP, hpScale } from "./rules";
import type { Creep, EnemyType, Game, RouteKey, Wave, WaveEntry, WaveRoute } from "./types";

export function makeWave(g: Game, n: number): Wave {
  const D = g.D(),
    B = g.B,
    WV = B.waves;
  const route: WaveRoute =
    n <= WV.alternateUntil ? (n % 2 ? "h" : "v") : WV.bothEvery.some((k) => n % k === 0) ? "both" : n % 2 ? "h" : "v";
  const rt = (k: number): RouteKey => (route === "both" ? (k % 2 ? "v" : "h") : route);
  const list: WaveEntry[] = [];
  if (n === B.board.finalWave) {
    for (let k = 0; k < WV.final.armored; k++)
      list.push({ type: "armored", route: rt(k), gap: WV.final.armoredGap, m: WV.final.armoredMultiplier });
    list.push({ type: "queen", route: "h", gap: WV.final.queenGap, m: WV.final.queenMultiplier });
    return { type: "queen", route: "both", list };
  }
  const cyc = n >= D.newFrom ? WV.cycleNew : WV.cycle;
  const type: EnemyType = n % WV.bossEvery === 0 ? "boss" : cyc[(n - 1) % cyc.length];
  if (type === "boss") {
    for (let k = 0; k < WV.boss.escorts; k++)
      list.push({ type: "crawler", route: rt(k), gap: WV.boss.escortGap, m: 1 });
    const b = n / WV.bossEvery,
      cnt = Math.min(b, WV.boss.maxPerWave),
      m = b / cnt;
    for (let k = 0; k < cnt; k++) list.push({ type: "boss", route: rt(k), gap: WV.boss.gap, m });
  } else {
    // Large waves are capped in count; the missing units are folded into HP and reward.
    const f = WV.counts[type]!;
    const raw = (f.base + n / f.divisor) | 0;
    // Flyers come in fewer, tougher units: each leak costs a life, so a partly failed air wave stays survivable.
    const cap = WV.caps[type] ?? WV.caps.default,
      cnt = Math.min(raw, cap),
      m = raw / cnt;
    for (let k = 0; k < cnt; k++) list.push({ type, route: rt(k), gap: B.enemies[type].gap, m });
    // Mixed waves on harder levels: flyers ride along with ground waves, healers escort armor.
    if (n >= D.mixFrom && type !== "flyer") {
      const mf = WV.mixedFlyers,
        fl = Math.max(mf.min, Math.round(cnt * mf.fraction));
      for (let k = 0; k < fl; k++)
        list.splice(Math.floor(((k + 0.5) * list.length) / fl) + k, 0, {
          type: "flyer",
          route: rt(k),
          gap: mf.gap,
          m: m * mf.multiplier,
        });
    }
    if (n >= D.newFrom && type === "armored") {
      const eh = WV.escortHealers,
        hc = Math.max(eh.min, Math.round(cnt * eh.fraction));
      for (let k = 0; k < hc; k++)
        list.splice(Math.floor(((k + 0.5) * list.length) / hc) + k, 0, {
          type: "healer",
          route: rt(k),
          gap: eh.gap,
          m,
        });
    }
  }
  return { type, route, list };
}

/** Seconds until the next wave arrives on its own. */
export function waveGap(g: Game, n: number, list: WaveEntry[]): number {
  const spawnTime = list.reduce((a, e) => a + e.gap, 0);
  return Math.max(g.D().gap + g.B.waves.gap.perWave * n, spawnTime + g.B.waves.gap.margin);
}

/** Puts one creep of wave n on the board. */
export function spawnCreep(g: Game, e: WaveEntry, n: number): void {
  // Bosses take only the square root of the difficulty HP bonus, so boss waves stay beatable.
  // Flyers skip the maze and spend far less time under fire, so their HP grows slower.
  const B = g.B,
    K = B.combat,
    { width: W, routes: ROUTES } = B.board;
  const T = B.enemies[e.type],
    R = ROUTES[e.route],
    Df = g.D(),
    dh = diffHP(B, Df, n),
    hs = T.fly ? Math.pow(hpScale(B, n), B.scaling.flyerHpExponent) : hpScale(B, n);
  const m = hs * (T.boss ? Math.sqrt(dh) : dh) * (e.m || 1);
  const c: Creep = {
    id: g.newId(),
    type: e.type,
    route: e.route,
    wave: n,
    hp: T.hp * m,
    max: T.hp * m,
    spd: T.spd * Df.spd,
    boss: !!T.boss,
    armor: T.armor ? T.armor + Math.floor(n / Df.armorDiv) + Df.armor : 0,
    rw: Math.max(1, Math.round(T.rw * (1 + n * B.scaling.rewardGrowth) * (e.m || 1) * Df.rw)),
    healT: g.rand(),
    blinkT: K.blinker.firstMin + g.rand() * K.blinker.firstSpread,
    r: T.r,
    fly: !!T.fly,
    slow: 0,
    slowT: 0,
    stunT: 0,
    burnT: 0,
    burn: 0,
    vulnT: 0,
    vuln: 0,
    dead: false,
    ox: 0,
    oy: 0,
    x: 0,
    y: 0,
    ang: Math.atan2(R.dir[1], R.dir[0]),
    dx: R.dir[0],
    dy: R.dir[1],
    // flyers use gx/gy, ground units tx/ty/ti/ci; the other set stays at its neutral value
    gx: 0,
    gy: 0,
    tx: 0,
    ty: 0,
    ti: -1,
    ci: -1,
    leaving: false,
  };
  if (c.fly) {
    const s = mid(R.spawn),
      ex = mid(R.exit),
      off = (g.rand() - 0.5) * K.flyerLane.width,
      mg = K.flyerLane.margin;
    c.x = s[0] - R.dir[0] * mg + R.dir[1] * off;
    c.y = s[1] - R.dir[1] * mg + R.dir[0] * off;
    c.gx = ex[0] + R.dir[0] * mg + R.dir[1] * off;
    c.gy = ex[1] + R.dir[1] * mg + R.dir[0] * off;
  } else {
    const s = R.spawn[(g.rand() * R.spawn.length) | 0];
    c.x = s[0] - R.dir[0];
    c.y = s[1] - R.dir[1];
    c.tx = s[0];
    c.ty = s[1];
    c.ti = s[1] * W + s[0];
    c.ci = -1;
    c.leaving = false;
    c.ox = (g.rand() - 0.5) * K.spawnJitter;
    c.oy = (g.rand() - 0.5) * K.spawnJitter;
  }
  g.S.creeps.push(c);
}

/** Calls the next wave now or when the timer runs out; calling early pays the time left as a bonus. */
export function sendWave(g: Game, early?: boolean): void {
  const S = g.S,
    FINAL = g.B.board.finalWave;
  if (S.wave >= FINAL || S.over) return;
  if (early && S.timer > 0) {
    const b = Math.floor(S.timer * g.B.economy.earlyBonusPerSecond);
    if (b > 0) {
      S.credits += b;
      g.emit({ type: "toast", key: "early", vars: { b } });
    }
  }
  S.wave++;
  S.started = true;
  const w = makeWave(g, S.wave);
  S.spawners.push({ list: w.list.slice(), t: 0, wave: S.wave });
  S.left[S.wave] = w.list.length;
  S.timer = S.wave >= FINAL ? Infinity : waveGap(g, S.wave, w.list);
  g.emit({ type: "wave", n: S.wave });
  if (S.wave === FINAL) g.emit({ type: "toast", key: "finalToast" });
}

/** Advances the wave timer and releases queued creeps. */
export function stepSpawners(g: Game, dt: number): void {
  const S = g.S;
  S.timer -= dt;
  if (S.timer <= 0) sendWave(g, false);
  for (const s of S.spawners) {
    s.t -= dt;
    while (s.t <= 0 && s.list.length) {
      const e = s.list.shift()!;
      spawnCreep(g, e, s.wave);
      s.t += e.gap;
    }
  }
  S.spawners = S.spawners.filter((s) => s.list.length);
}
