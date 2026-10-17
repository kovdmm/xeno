// Types of the game simulation. Nothing here knows about DOM, canvas, sound or UI texts.

export type Rng = () => number;
export type Vec = [number, number];

/** The name of a route in a level (a level has one or more). */
export type RouteKey = string;
export type WaveRoute = RouteKey | "both";
export type TowerType = "gun" | "cannon" | "frost" | "missile" | "laser" | "plasma" | "rail" | "artillery";
export type EnemyType = "crawler" | "runner" | "swarm" | "armored" | "flyer" | "healer" | "blinker" | "boss" | "queen";
export type DiffKey = "easy" | "normal" | "hard" | "insane";
export type AbilityKey = "stasis" | "meteor" | "napalm" | "carpet" | "nuke";
export type Priority = "first" | "strong";

/* ---------- balance data ---------- */

export interface Route {
  /** the cells enemies enter through: on the edge of the board, side by side */
  spawn: Vec[];
  /** the cells they must reach */
  exit: Vec[];
  /** the unit step enemies take when they come in (from outside the board, through the spawn cells) */
  dir: Vec;
  /** the unit step they take when they leave through the exit; the same as `dir` when absent */
  exitDir?: Vec;
}

/** The shape of a level's board. */
export interface MapDef {
  width: number;
  height: number;
  routes: Record<RouteKey, Route>;
  /** blocks that cannot be built on or walked through */
  walls?: Rect[];
}

/** A block of cells: x, y is its top-left cell. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A level as written in the balance data. */
export interface LevelDef {
  map: MapDef;
  /** the last wave: clearing it wins the game */
  finalWave: number;
}

/** The level being played, with its id and the walls always present. */
export interface Level {
  id: string;
  width: number;
  height: number;
  finalWave: number;
  routes: Record<RouteKey, Route>;
  walls: Vec[];
}

/** Everything a tower does in a given shape; derived from the tables by `towerStats`. */
export interface TowerStats {
  dmg: number;
  rate: number;
  range: number;
  splash: number;
  slow: number;
  burn: number;
  minR: number;
  beams: number;
  width: number;
  pierce: boolean;
  air: number;
  ground: number;
  prio: Priority;
  multi: number;
  // set by ultimates only
  cluster?: number;
  stun?: number;
  freeze?: number;
  vuln?: number;
  heat?: number;
  nova?: number;
  plague?: number;
}

export type StatKey = keyof TowerStats;

/** An ultimate as data: applied to the level-4 stats in the order set → mul → div. */
export interface UltEffect {
  set?: Partial<Record<StatKey, number | string>>;
  mul?: Partial<Record<StatKey, number>>;
  div?: Partial<Record<StatKey, number>>;
}

export interface TowerDef {
  key: string;
  size?: number;
  /** build, up to 2, up to 3, up to 4 */
  cost: number[];
  dmg: number[];
  rate: number[];
  range: number[];
  splash?: number[];
  slow?: number[];
  burn?: number[];
  minR?: number;
  air: number;
  ground: number;
  pierce?: number;
  prio?: Priority;
  ults: Record<string, UltEffect>;
}

export interface EnemyDef {
  hp: number;
  spd: number;
  /** reward */
  rw: number;
  armor: number;
  /** radius */
  r: number;
  /** spawn gap, s */
  gap: number;
  fly?: number;
  lives?: number;
  boss?: number;
}

export interface Difficulty {
  hp: number;
  armor: number;
  armorDiv: number;
  spd: number;
  rw: number;
  credits: number;
  lives: number;
  /** ability price factor */
  ab: number;
  gap: number;
  mixFrom: number;
  newFrom: number;
}

export interface AbilityDef {
  key: string;
  base: number;
  per: number;
  cd: number;
  aim: 0 | "circle" | "row";
  r?: number;
  // what the ability does once cast; each ability uses its own subset
  duration?: number;
  slow?: number;
  bossSlow?: number;
  count?: number;
  interval?: number;
  fall?: number;
  /** damage as a multiple of the health of a basic unit of the current wave */
  damageUnits?: number;
  dpsUnits?: number;
  impactRadius?: number;
  speed?: number;
  bombInterval?: number;
  spread?: number;
  startX?: number;
  exitMargin?: number;
  delay?: number;
  hpFraction?: number;
  bossHpFraction?: number;
}

/* ---------- state ---------- */

export interface Tower {
  id: number;
  type: TowerType;
  lvl: number;
  oc: number;
  ult?: string;
  gx: number;
  gy: number;
  size: number;
  x: number;
  y: number;
  cd: number;
  ang: number;
  /** credits invested (for the refund) */
  inv: number;
  beam: Creep[] | null;
  tgts?: Creep[];
  heatT?: number;
  heatTgt?: Creep | null;
  heatM?: number;
  pulse?: number;
}

export interface Creep {
  id: number;
  type: EnemyType;
  route: RouteKey;
  wave: number;
  hp: number;
  max: number;
  spd: number;
  boss: boolean;
  armor: number;
  rw: number;
  healT: number;
  blinkT: number;
  r: number;
  fly: boolean;
  slow: number;
  slowT: number;
  stunT: number;
  stunImm?: number;
  burnT: number;
  burn: number;
  plague?: boolean;
  spreadT?: number;
  vulnT: number;
  vuln: number;
  healedAt?: number;
  dead: boolean;
  /** drawing offset inside the cell */
  ox: number;
  oy: number;
  x: number;
  y: number;
  ang: number;
  dx: number;
  dy: number;
  // flyers: straight line to (gx, gy)
  gx: number;
  gy: number;
  // ground units: the cell being walked to / left
  tx: number;
  ty: number;
  ti: number;
  ci: number;
  leaving: boolean;
}

interface ProjBase {
  x: number;
  y: number;
  dead?: boolean;
}
export interface Bullet extends ProjBase {
  k: "b";
  tgt: Creep;
  dmg: number;
  spd: number;
  big: boolean;
  pierce: boolean;
}
export interface Shell extends ProjBase {
  k: "s";
  src: "cannon" | "bomblet";
  tgt: Creep | null;
  tx: number;
  ty: number;
  dmg: number;
  sp: number;
  spd: number;
  big: boolean;
  pierce: boolean;
  cluster?: number;
  stun?: number;
}
export interface Missile extends ProjBase {
  k: "m";
  tgt: Creep;
  dmg: number;
  v: number;
  ang: number;
  life: number;
  pierce: boolean;
  air: number;
  ground: number;
  sp: number;
}
export interface Plasma extends ProjBase {
  k: "pl";
  tgt: Creep;
  dmg: number;
  burn: number;
  spd: number;
  big: boolean;
  pierce: boolean;
  nova?: number;
  plague?: number;
}
export interface Howitzer extends ProjBase {
  k: "a";
  sx: number;
  sy: number;
  tgt: Creep;
  tx: number;
  ty: number;
  f: number;
  dur: number;
  h: number;
  dmg: number;
  sp: number;
  pierce: boolean;
  nuke: boolean;
}
export type Projectile = Bullet | Shell | Missile | Plasma | Howitzer;
export type ProjKind = Projectile["k"];

export interface WaveEntry {
  type: EnemyType;
  route: RouteKey;
  gap: number;
  /** health and reward multiplier */
  m: number;
}
export interface Wave {
  type: EnemyType;
  route: WaveRoute;
  list: WaveEntry[];
}
export interface Spawner {
  list: WaveEntry[];
  t: number;
  wave: number;
}

export interface Meteor {
  kind: "meteor" | "bomb";
  x: number;
  y: number;
  t: number;
  fall: number;
  dmg: number;
  r: number;
  done?: boolean;
}
export interface FireZone {
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
  dps: number;
}
export interface Bomber {
  x: number;
  y: number;
  next: number;
  dmg: number;
}
export interface Nuke {
  x: number;
  y: number;
  t: number;
  r: number;
  dmg: number;
  done?: boolean;
}

export interface State {
  diff: DiffKey;
  /** the id of the level being played */
  level: string;
  credits: number;
  lives: number;
  wave: number;
  score: number;
  started: boolean;
  over: boolean;
  won: boolean;
  cheated?: boolean;
  t: number;
  grid: (Tower | null)[];
  towers: Tower[];
  creeps: Creep[];
  proj: Projectile[];
  spawners: Spawner[];
  /** creeps of each wave still alive */
  left: Record<number, number>;
  timer: number;
  /** distance-to-exit fields per route */
  fields: Record<RouteKey, Int32Array>;
  cd: Record<AbilityKey, number>;
  meteors: Meteor[];
  zones: FireZone[];
  bombers: Bomber[];
  nukes: Nuke[];
  stasisT: number;
}

/* ---------- events ---------- */

export type ExplosionKind =
  "shell" | "bomblet" | "missile" | "plasma" | "artillery" | "nukeShell" | "meteor" | "bomb" | "nuke";

export type GameEvent =
  | { type: "reset" }
  | { type: "toast"; key: string; vars?: Record<string, number> }
  | { type: "wave"; n: number }
  | { type: "built"; tower: Tower }
  | { type: "upgraded"; tower: Tower }
  | { type: "sold"; tower: Tower }
  | { type: "leak"; creep: Creep }
  | { type: "kill"; creep: Creep; x: number; y: number }
  | { type: "end"; won: boolean }
  | { type: "shot"; tower: Tower }
  | { type: "pulse"; tower: Tower; r: number; freeze: boolean }
  | { type: "heal"; x: number; y: number; r: number }
  | { type: "blink"; x: number; y: number; x2: number; y2: number }
  | { type: "rail"; tower: Tower; x: number; y: number; x2: number; y2: number; width: number; big: boolean }
  | { type: "muzzle"; tower: Tower; x: number; y: number }
  | { type: "explode"; kind: ExplosionKind; x: number; y: number; r: number }
  | { type: "cast"; ability: AbilityKey; pt: Vec | undefined }
  | { type: "cheat"; code: string };

/* ---------- commands ---------- */

export type PlaceCode = "" | "out" | "busy" | "pcEdge" | "pc22" | "pcRes" | "pcEnemy" | "pcBlock" | "pcTrap";

export type PlaceResult = { ok: true; tower: Tower } | { ok: false; code: string };
export type UpgradeResult =
  { ok: true; ult: string | null } | { ok: true; overclock: number } | { ok: false; code: string };
export type CastResult = { ok: true } | { ok: false; code: string; s?: number };

/** Everything a system needs from the running game. Systems are plain functions of `(g, …)`. */
export interface Game {
  S: State;
  /** the level being played */
  L: Level;
  /** all numbers of the game: see data/balance.json */
  readonly B: Balance;
  diff: DiffKey;
  rand: Rng;
  emit(e: GameEvent): void;
  newId(): number;
  D(): Difficulty;
}

/* ---------- balance: the shape of data/balance.json ---------- */

export interface Balance {
  board: {
    /** a walking enemy closer than this to a cell (centre to centre) blocks building there */
    enemyBlockRadius: number;
  };
  /** the levels, in the order the player meets them; the first is the default */
  levels: Record<string, LevelDef>;
  economy: {
    /** share of the invested credits returned on sale */
    sellRefund: number;
    /** the level-5 upgrade costs this many times the level-4 one */
    ultimateCostMultiplier: number;
    overclock: { damageGrowth: number; costBase: number; costGrowth: number };
    /** credits for clearing wave n: base + perWave * n */
    waveClearBonus: { base: number; perWave: number };
    earlyBonusPerSecond: number;
    /** score for a kill: reward * perReward + current wave * perWave */
    score: { perReward: number; perWave: number };
    cheats: Record<string, { minLives: number; credits: number }>;
  };
  /** how enemy health and rewards grow with the wave number */
  scaling: {
    unitHp: number;
    linear: number;
    quadratic: number;
    lateFromWave: number;
    lateGrowth: number;
    rampFromWave: number;
    rampLength: number;
    flyerHpExponent: number;
    rewardGrowth: number;
  };
  combat: {
    armorFloor: number;
    splashCore: number;
    splashEdge: number;
    splashPad: number;
    burnDuration: number;
    stunBossFactor: number;
    stunImmunity: number;
    stunImmunityBoss: number;
    plague: { interval: number; radius: number };
    healer: { interval: number; radius: number; selfHeal: number; allyHeal: number; window: number };
    blinker: { interval: number; distance: number; firstMin: number; firstSpread: number };
    creepTurnRate: number;
    spawnJitter: number;
    flyerLane: { width: number; margin: number };
  };
  shooting: {
    maxShotsPerTick: number;
    aimRate: number;
    laserHeatBonus: number;
    frost: { freezeEvery: number; slowTime: number; vulnTime: number; minCooldown: number };
  };
  projectiles: {
    bullet: { speed: number; strongSpeed: number; muzzle: number; hitRadius: number };
    shell: {
      speed: number;
      muzzle: number;
      bomblet: { damageFraction: number; splash: number; speed: number; scatterMin: number; scatterRange: number };
    };
    missile: {
      sideAngle: number;
      sideOffset: number;
      spread: number;
      spreadStep: number;
      speed: number;
      accel: number;
      maxSpeed: number;
      turnRate: number;
      life: number;
      hitRadius: number;
      pairDamageDivisor: number;
      retargetRange: number;
      defaultBlast: number;
    };
    plasma: { speed: number; muzzle: number; hitRadius: number; novaDamageFraction: number; defaultBlast: number };
    howitzer: { muzzle: number; flightTime: number; stagger: number; arcHeight: number; nukeSplash: number };
    rail: { halfWidth: number };
  };
  waves: {
    alternateUntil: number;
    bothEvery: number[];
    bossEvery: number;
    cycle: EnemyType[];
    cycleNew: EnemyType[];
    /** units in a wave: base + n / divisor (capped by `caps`) */
    counts: Partial<Record<EnemyType, { base: number; divisor: number }>>;
    caps: { default: number } & Partial<Record<EnemyType, number>>;
    boss: { escorts: number; escortGap: number; maxPerWave: number; gap: number };
    final: {
      armored: number;
      armoredGap: number;
      armoredMultiplier: number;
      queenGap: number;
      queenMultiplier: number;
    };
    mixedFlyers: { fraction: number; min: number; gap: number; multiplier: number };
    escortHealers: { fraction: number; min: number; gap: number };
    gap: { perWave: number; margin: number };
  };
  towers: Record<TowerType, TowerDef>;
  enemies: Record<EnemyType, EnemyDef>;
  difficulty: Record<DiffKey, Difficulty>;
  abilities: Record<AbilityKey, AbilityDef>;
}
