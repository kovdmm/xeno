// Soft additive glows. They are the main fill-rate cost, so they are capped per frame.
import { alpha } from "./color";
import type { Ctx } from "./types";

export class Glows {
  private cache = new Map<string, HTMLCanvasElement>();
  private budget = 0;
  constructor(private createCanvas: () => HTMLCanvasElement) {}

  /** Starts a frame with room for `n` glows. */
  reset(n: number) {
    this.budget = n;
  }

  private sprite(col: string) {
    let g = this.cache.get(col);
    if (g) return g;
    const cv = this.createCanvas();
    cv.width = cv.height = 64;
    const c = cv.getContext("2d")!;
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.18, alpha(col, 0.95));
    gr.addColorStop(0.5, alpha(col, 0.35));
    gr.addColorStop(1, alpha(col, 0));
    c.fillStyle = gr;
    c.fillRect(0, 0, 64, 64);
    this.cache.set(col, cv);
    return cv;
  }

  /** Oversized glows shrink; `force` ignores the budget. Leaves globalAlpha at `a`. */
  add(ctx: Ctx, col: string, x: number, y: number, r: number, a = 1, force = false) {
    if (!force && --this.budget < 0) return;
    r = Math.min(r, 2.6);
    ctx.globalAlpha = a;
    ctx.drawImage(this.sprite(col), x - r, y - r, r * 2, r * 2);
  }
}
