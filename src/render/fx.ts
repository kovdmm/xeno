// Visual effects as data: particles, floating texts, screen flashes and shake. This is calculation only,
// nothing here draws (the particle and text layers do) and nothing here touches the simulation.
import type { Tower } from "../game/types";
import { TAU, THEME } from "./theme";
import type { QualityLevel } from "./quality";
import type { World } from "./types";

interface Base {
  x: number;
  y: number;
  /** seconds left */
  life: number;
  max: number;
}
export interface Spark extends Base {
  k: "spark";
  vx: number;
  vy: number;
  col: string;
  /** size, cells */
  s: number;
}
export interface Smoke extends Base {
  k: "smoke";
  vx: number;
  vy: number;
  r: number;
}
export interface Flame extends Base {
  k: "flame";
  vx: number;
  vy: number;
  col: string;
  r: number;
}
export interface Blast extends Base {
  k: "blast";
  r: number;
  col: string;
}
export interface Muzzle extends Base {
  k: "muzzle";
  r: number;
  col: string;
}
export interface Ring extends Base {
  k: "ring";
  r: number;
  col: string;
  w: number;
}
export interface Zap extends Base {
  k: "zap";
  x2: number;
  y2: number;
  col: string;
}
export interface RailTrail extends Base {
  k: "rail";
  x2: number;
  y2: number;
  col: string;
  w: number;
}
export type Particle = Spark | Smoke | Flame | Blast | Muzzle | Ring | Zap | RailTrail;
type Drifting = Spark | Smoke | Flame;

export interface FloatText {
  x: number;
  y: number;
  v: string;
  life: number;
  max: number;
}

export class Fx {
  particles: Particle[] = [];
  texts: FloatText[] = [];
  /** white screen flash, 0..1 */
  flash = 0;
  /** red vignette when something gets through, 0..1 */
  redFlash = 0;
  /** screen shake, 0..0.6 */
  shake = 0;
  /** recoil of a tower that just fired, 1 → 0 */
  readonly kick = new WeakMap<Tower, number>();

  constructor(
    private quality: () => QualityLevel,
    private rand: () => number,
    private reduceMotion: boolean,
  ) {}

  reset() {
    this.particles = [];
    this.texts = [];
    this.flash = this.redFlash = this.shake = 0;
  }

  /** Adds a particle unless the field is busy: cosmetic sparks and smoke are dropped first. */
  add(p: Particle) {
    const q = this.quality();
    if (this.particles.length < q.fx && ((p.k !== "spark" && p.k !== "smoke") || this.particles.length < q.cos))
      this.particles.push(p);
  }

  addShake(a: number) {
    if (!this.reduceMotion) this.shake = Math.min(0.6, this.shake + a);
  }

  sparks(x: number, y: number, n: number, col: string, v0: number, v1: number, life: number, s = 0.05) {
    const rand = this.rand;
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU,
        v = v0 + rand() * (v1 - v0);
      this.add({
        k: "spark",
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: life * (0.5 + rand() * 0.5),
        max: life,
        col,
        s,
      });
    }
  }

  smoke(x: number, y: number, n: number, r: number) {
    const rand = this.rand;
    for (let i = 0; i < n; i++)
      this.add({
        k: "smoke",
        x: x + (rand() - 0.5) * r,
        y: y + (rand() - 0.5) * r,
        vx: (rand() - 0.5) * 0.4,
        vy: -0.3 - rand() * 0.4,
        life: 0.8 + rand() * 0.6,
        max: 1.4,
        r: 0.2 + rand() * r * 0.4,
      });
  }

  blast(x: number, y: number, r: number, col: string, life: number, flashA = 0) {
    this.add({ k: "blast", x, y, r, col, life, max: life });
    this.smoke(x, y, Math.min(6, (2 + r * 2) | 0), r);
    if (flashA) this.flash = Math.max(this.flash, flashA);
  }

  /** One step of time: new ambient effects from what is happening in the world, then ageing of everything. */
  step(dt: number, world: World, rot: boolean) {
    const rand = this.rand,
      S = world.S;
    for (const t of S.towers)
      if (t.beam)
        for (const c of t.beam)
          if (rand() < dt * 12) {
            const [x, y] = world.pos(c);
            this.sparks(x, y, 1, THEME.tower.laser, 0.5, 2, 0.25, 0.04);
          }
    for (const p of S.proj)
      if (p.k === "m" && rand() < dt * 25)
        this.add({ k: "smoke", x: p.x, y: p.y, vx: 0, vy: 0, life: 0.5, max: 0.5, r: 0.08 });
    for (const c of S.creeps)
      if (c.burnT > 0 && rand() < dt * 6) {
        const [x, y] = world.pos(c);
        this.add({
          k: "flame",
          x: x + (rand() - 0.5) * c.r,
          y,
          vx: 0,
          vy: -0.9,
          life: 0.45,
          max: 0.45,
          col: c.plague ? THEME.plague : THEME.fire,
          r: 0.18,
        });
      }
    for (const z of S.zones)
      if (rand() < dt * 14) {
        const a = rand() * TAU,
          r = Math.sqrt(rand()) * z.r;
        this.add({
          k: "flame",
          x: z.x + Math.cos(a) * r,
          y: z.y + Math.sin(a) * r,
          vx: 0,
          vy: -0.7,
          life: 0.6,
          max: 0.6,
          col: THEME.fire,
          r: 0.3,
        });
      }
    for (const f of this.particles) {
      f.life -= dt;
      if ("vx" in f) {
        const d = f as Drifting;
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.k === "spark") {
          d.vx *= 0.9;
          d.vy *= 0.9;
        }
      }
    }
    this.particles = this.particles.filter((f) => f.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      if (rot) t.x -= dt * 0.9;
      else t.y -= dt * 0.9;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    this.flash = Math.max(0, this.flash - dt * 1.4);
    this.redFlash = Math.max(0, this.redFlash - dt * 1.2);
    this.shake = Math.max(0, this.shake - dt * 1.6);
    for (const t of S.towers) {
      const k = this.kick.get(t);
      if (k !== undefined && k > 0) this.kick.set(t, Math.max(0, k - dt * 7));
    }
  }
}
