// one-off: builds src/game/data/balance.json from the pre-refactor tables (git history) + constants found in code
const fs = require("fs");
const { execSync } = require("child_process");
const src = execSync("git show fe2ae15:src/core.js", { encoding: "utf8", maxBuffer: 1 << 26 }).split("\n");
const block = (re) => {
  const i = src.findIndex((l) => re.test(l));
  let j = i;
  while (!/^ {2}\};$/.test(src[j])) j++;
  return src.slice(i, j + 1).join("\n");
};
const ev = (name) => new Function(block(new RegExp(`^ {2}const ${name} = \\{`)).replace(/^ {2}const (\w+) =/, "const $1 =") + `\nreturn ${name};`)();
const TEXT = ["name", "name_en", "desc", "desc_en", "short", "short_en", "label", "label_en"];
const strip = (o) => {
  if (Array.isArray(o)) return o.map(strip);
  if (o && typeof o === "object") return Object.fromEntries(Object.entries(o).filter(([k]) => !TEXT.includes(k)).map(([k, v]) => [k, strip(v)]));
  return o;
};

// declarative ultimates: applied as set → mul → div on the level-4 stats (no stat appears in two operations)
const ULTS = {
  gun: { mini: { div: { rate: 6 } }, sniper: { mul: { range: 1.7, dmg: 6, rate: 2 }, set: { prio: "strong" } } },
  cannon: { cluster: { set: { cluster: 6 }, mul: { dmg: 2 } }, shock: { mul: { dmg: 2.5, splash: 1.4 }, set: { stun: 0.5 } } },
  frost: { zero: { set: { freeze: 1.2, slow: 0.8 }, mul: { range: 1.4 } }, brittle: { set: { vuln: 0.6 }, mul: { range: 1.6 } } },
  missile: { swarm: { set: { multi: 8 }, mul: { dmg: 0.8 } }, sam: { set: { ground: 1, splash: 1.2 } } },
  laser: { prism: { set: { beams: 4 } }, heat: { set: { heat: 4 }, mul: { range: 1.3 } } },
  plasma: { nova: { set: { nova: 1.4 }, mul: { dmg: 2, burn: 2 } }, plague: { set: { plague: 1 }, mul: { burn: 6 } } },
  rail: { gauss: { mul: { dmg: 2.5, range: 1.2 }, set: { width: 3 } }, auto: { div: { rate: 5 } } },
  artillery: { salvo: { set: { multi: 5 } }, nuke: { mul: { dmg: 7, rate: 3 }, set: { splash: 3.5 } } },
};
// sanity: the declarative form must equal the old functions on a probe stat block
const probe = () => ({ dmg: 10, rate: 2, range: 3, splash: 1, slow: 0.3, burn: 5, minR: 0, beams: 1, width: 1, pierce: false, air: 1, ground: 1, prio: "first", multi: 0 });
const apply = (s, e) => {
  for (const [k, v] of Object.entries(e.set || {})) s[k] = v;
  for (const [k, v] of Object.entries(e.mul || {})) s[k] *= v;
  for (const [k, v] of Object.entries(e.div || {})) s[k] /= v;
  return s;
};

const TT = ev("TT");
const towers = {};
for (const [k, d] of Object.entries(TT)) {
  const t = strip(d);
  const ults = {};
  for (const [u, def] of Object.entries(d.ults)) {
    const a = probe();
    def.f(a);
    const b = apply(probe(), ULTS[k][u]);
    if (JSON.stringify(Object.entries(a).sort()) !== JSON.stringify(Object.entries(b).sort())) throw new Error(`ult mismatch ${k}.${u}`);
    ults[u] = ULTS[k][u];
  }
  t.ults = ults;
  towers[k] = t;
}
const routes = strip(ev("ROUTES"));
const enemies = strip(ev("ET"));
const difficulty = strip(ev("DIFF"));
const abilities = strip(ev("AB"));
// ability runtime parameters (previously literals inside cast/stepAbilities)
Object.assign(abilities.stasis, { slow: 0.75, bossSlow: 0.4, duration: 8 });
Object.assign(abilities.meteor, { count: 15, interval: 0.17, fall: 0.6, damageUnits: 1.5, impactRadius: 1 });
Object.assign(abilities.napalm, { duration: 10, dpsUnits: 0.6 });
Object.assign(abilities.carpet, { speed: 8, bombInterval: 0.6, spread: 1.2, fall: 0.35, damageUnits: 1.3, impactRadius: 1.1, startX: -1.5, exitMargin: 2 });
Object.assign(abilities.nuke, { delay: 1.5, damageUnits: 8, hpFraction: 0.35, bossHpFraction: 0.1 });

const cyc = (n) => new Function(src.find((l) => new RegExp(`^ {2}const ${n} = `).test(l)).replace(/^ {2}const \w+ =/, "return"))();

const balance = {
  board: { width: 22, height: 15, finalWave: 200, routes },
  economy: {
    sellRefund: 0.7,
    ultimateCostMultiplier: 3,
    overclock: { damageGrowth: 1.25, costBase: 1.5, costGrowth: 1.45 },
    waveClearBonus: { base: 4, perWave: 1 },
    earlyBonusPerSecond: 1,
    score: { perReward: 10, perWave: 1 },
    cheats: { hesoyam: { minLives: 100, credits: 250000 } },
  },
  scaling: {
    unitHp: 32,
    linear: 0.24,
    quadratic: 0.02,
    lateFromWave: 100,
    lateGrowth: 1.013,
    rampFromWave: 8,
    rampLength: 52,
    flyerHpExponent: 0.9,
    rewardGrowth: 0.04,
  },
  combat: {
    armorFloor: 0.25,
    splashCore: 0.4,
    splashEdge: 0.6,
    splashPad: 0.5,
    burnDuration: 2,
    stunBossFactor: 0.25,
    stunImmunity: 2.5,
    stunImmunityBoss: 4,
    plague: { interval: 0.5, radius: 1.1 },
    healer: { interval: 0.5, radius: 1.6, selfHeal: 0.01, allyHeal: 0.02, window: 0.49 },
    blinker: { interval: 3.5, distance: 4, firstMin: 2, firstSpread: 2 },
    creepTurnRate: 12,
    spawnJitter: 0.3,
    flyerLane: { width: 2.4, margin: 1.5 },
  },
  shooting: {
    maxShotsPerTick: 6,
    aimRate: 14,
    laserHeatBonus: 7,
    frost: { freezeEvery: 3, slowTime: 1.6, vulnTime: 2, minCooldown: 0.5 },
  },
  projectiles: {
    bullet: { speed: 16, strongSpeed: 30, muzzle: 0.4, hitRadius: 0.1 },
    shell: { speed: 9, muzzle: 0.4, bomblet: { damageFraction: 0.4, splash: 0.75, speed: 5, scatterMin: 0.6, scatterRange: 1 } },
    missile: {
      sideAngle: 1.2,
      sideOffset: 0.25,
      spread: 0.4,
      spreadStep: 0.15,
      speed: 2,
      accel: 12,
      maxSpeed: 10,
      turnRate: 7,
      life: 6,
      hitRadius: 0.15,
      pairDamageDivisor: 2,
      retargetRange: 10,
      defaultBlast: 0.35,
    },
    plasma: { speed: 7, muzzle: 0.4, hitRadius: 0.12, novaDamageFraction: 0.6, defaultBlast: 0.3 },
    howitzer: { muzzle: 0.7, flightTime: 1.1, stagger: 0.12, arcHeight: 1.8, nukeSplash: 3 },
    rail: { halfWidth: 0.15 },
  },
  waves: {
    alternateUntil: 6,
    bothEvery: [4, 10],
    bossEvery: 10,
    cycle: cyc("CYCLE"),
    cycleNew: cyc("CYCLE2"),
    counts: {
      crawler: { base: 10, divisor: 2 },
      runner: { base: 10, divisor: 2 },
      swarm: { base: 18, divisor: 1 },
      armored: { base: 6, divisor: 3 },
      flyer: { base: 8, divisor: 3 },
      healer: { base: 6, divisor: 4 },
      blinker: { base: 10, divisor: 3 },
    },
    caps: { default: 60, swarm: 90, flyer: 30 },
    boss: { escorts: 8, escortGap: 0.7, maxPerWave: 6, gap: 2.5 },
    final: { armored: 24, armoredGap: 0.6, armoredMultiplier: 3, queenGap: 3, queenMultiplier: 14 },
    mixedFlyers: { fraction: 0.2, min: 2, gap: 0.4, multiplier: 0.8 },
    escortHealers: { fraction: 0.15, min: 2, gap: 0.6 },
    gap: { perWave: 0.12, margin: 8 },
  },
  towers,
  enemies,
  difficulty,
  abilities,
};
fs.writeFileSync("src/game/data/balance.json", JSON.stringify(balance, null, 2) + "\n");
console.log("written", Object.keys(balance).join(","), JSON.stringify(balance.waves.cycle), JSON.stringify(balance.waves.cycleNew));
