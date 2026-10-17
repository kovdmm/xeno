// Sprites rendered once into offscreen canvases and blitted every frame.
import { TAU } from "./theme";
import type { Projection } from "./projection";
import type { Ctx } from "./types";

export interface Sprite {
  cv: HTMLCanvasElement;
  /** side length in board cells */
  size: number;
}

/** Rotated sprites are rendered for this many angles; the angle is snapped to the nearest. */
const STEPS = 32;

export class SpriteCache {
  private cache = new Map<string, Sprite>();
  private smokeCv: HTMLCanvasElement | null = null;

  constructor(
    private proj: Projection,
    private createCanvas: () => HTMLCanvasElement,
  ) {}

  /** Forget everything: the pixel size of a cell changed. */
  clear() {
    this.cache.clear();
  }

  /** `fn` paints in cell units with the origin in the middle of a `size`-cell square. Painted once per key. */
  sprite(key: string, size: number, fn: (c: Ctx) => void): Sprite {
    let s = this.cache.get(key);
    if (s) return s;
    const px = Math.max(4, Math.ceil(size * this.proj.cs));
    const cv = this.createCanvas();
    cv.width = cv.height = px;
    const c = cv.getContext("2d")!;
    c.setTransform(px / size, 0, 0, px / size, px / 2, px / 2);
    fn(c);
    s = { cv, size };
    this.cache.set(key, s);
    return s;
  }

  /** A sprite turned to `ang`: each of the 32 steps is rendered once, so every frame is a plain copy. */
  rsprite(key: string, size: number, ang: number, fn: (c: Ctx) => void): Sprite {
    const st = ((Math.round((ang / TAU) * STEPS) % STEPS) + STEPS) % STEPS;
    return this.sprite(key + "@" + st, size * 1.42, (c) => {
      c.rotate((st * TAU) / STEPS);
      fn(c);
    });
  }

  /** Blits use plain drawImage in board space: much cheaper with hundreds of sprites than save/restore. */
  blit(c: Ctx, s: Sprite, x: number, y: number) {
    const d = s.size;
    c.drawImage(s.cv, x - d / 2, y - d / 2, d, d);
  }

  /** Like `blit`, but the sprite stays upright whatever the board rotation (text). */
  blitUp(c: Ctx, s: Sprite, x: number, y: number, dx = this.proj.ox, dy = this.proj.oy) {
    const p = this.proj;
    if (!p.rot) return this.blit(c, s, x, y);
    const d = s.size;
    c.setTransform(p.cs, 0, 0, p.cs, (p.H - y) * p.cs + dx, x * p.cs + dy);
    c.drawImage(s.cv, -d / 2, -d / 2, d, d);
    p.apply(c, dx, dy);
  }

  smoke(): HTMLCanvasElement {
    if (this.smokeCv) return this.smokeCv;
    const cv = (this.smokeCv = this.createCanvas());
    cv.width = cv.height = 32;
    const c = cv.getContext("2d")!;
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, "rgba(18,16,14,.9)");
    g.addColorStop(1, "rgba(18,16,14,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
    return cv;
  }
}
