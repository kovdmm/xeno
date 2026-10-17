import { alpha } from "../color";
import { TAU, THEME } from "../theme";
import type { Layer } from "../types";

/** Smoke, sparks, flames, blasts, rings and bolts. */
export const particles: Layer = {
  id: "particles",
  draw(fc) {
    const { ctx, glows, sprites, fx } = fc;
    const rand = fc.rand;
    for (const f of fx.particles) {
      const a = f.life / f.max;
      if (f.k === "smoke") {
        ctx.globalAlpha = 0.55 * a;
        const rr = f.r * (1.6 - a * 0.6);
        ctx.drawImage(sprites.smoke(), f.x + 0.5 - rr, f.y + 0.5 - rr, rr * 2, rr * 2);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "lighter";
    for (const f of fx.particles) {
      const a = f.life / f.max;
      if (f.k === "spark") {
        ctx.globalAlpha = a;
        ctx.fillStyle = f.col;
        ctx.fillRect(f.x + 0.5 - f.s / 2, f.y + 0.5 - f.s / 2, f.s, f.s);
      } else if (f.k === "flame") glows.add(ctx, f.col, f.x + 0.5, f.y + 0.5, f.r * (0.6 + a * 0.6), a);
      else if (f.k === "blast") {
        glows.add(ctx, f.col, f.x + 0.5, f.y + 0.5, f.r * (1.25 - a * 0.4), a, f.r > 2);
        if (f.r > 0.6) glows.add(ctx, THEME.white, f.x + 0.5, f.y + 0.5, f.r * 0.45 * a, a * a);
      } else if (f.k === "muzzle") glows.add(ctx, f.col, f.x + 0.5, f.y + 0.5, f.r, a);
      else if (f.k === "ring") {
        ctx.globalAlpha = a * 0.8;
        ctx.strokeStyle = f.col;
        ctx.lineWidth = f.w;
        ctx.beginPath();
        ctx.arc(f.x + 0.5, f.y + 0.5, f.r * (1 - a * 0.7), 0, TAU);
        ctx.stroke();
      } else if (f.k === "rail") {
        ctx.globalAlpha = a;
        ctx.strokeStyle = alpha(f.col, 0.6);
        ctx.lineCap = "round";
        ctx.lineWidth = 0.3 * a * f.w;
        ctx.beginPath();
        ctx.moveTo(f.x + 0.5, f.y + 0.5);
        ctx.lineTo(f.x2 + 0.5, f.y2 + 0.5);
        ctx.stroke();
        ctx.strokeStyle = THEME.white;
        ctx.lineWidth = 0.06 * f.w;
        ctx.stroke();
      } else if (f.k === "zap") {
        ctx.globalAlpha = a;
        ctx.strokeStyle = f.col;
        ctx.lineWidth = 0.05;
        ctx.beginPath();
        ctx.moveTo(f.x + 0.5, f.y + 0.5);
        for (let i = 1; i < 5; i++) {
          const k = i / 5;
          ctx.lineTo(
            f.x + (f.x2 - f.x) * k + 0.5 + (rand() - 0.5) * 0.3,
            f.y + (f.y2 - f.y) * k + 0.5 + (rand() - 0.5) * 0.3,
          );
        }
        ctx.lineTo(f.x2 + 0.5, f.y2 + 0.5);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },
};
