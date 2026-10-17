import { gloss, outline } from "../primitives";
import { TAU, THEME } from "../theme";
import type { Layer } from "../types";

/** The carpet bomber flying over. */
export const bombers: Layer = {
  id: "bombers",
  draw(fc) {
    const { ctx, world: C, t, glows } = fc;
    const S = C.S;
    for (const b of S.bombers) {
      const x = b.x + 0.5,
        y = b.y + 0.5;
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.ellipse(x + 0.4, y + 0.55, 0.75, 0.22, 0, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0.7, 0);
      ctx.lineTo(-0.1, -0.85);
      ctx.lineTo(-0.3, -0.85);
      ctx.lineTo(-0.15, -0.1);
      ctx.lineTo(-0.6, -0.1);
      ctx.lineTo(-0.75, -0.35);
      ctx.lineTo(-0.82, -0.35);
      ctx.lineTo(-0.75, 0);
      ctx.lineTo(-0.82, 0.35);
      ctx.lineTo(-0.75, 0.35);
      ctx.lineTo(-0.6, 0.1);
      ctx.lineTo(-0.15, 0.1);
      ctx.lineTo(-0.3, 0.85);
      ctx.lineTo(-0.1, 0.85);
      ctx.closePath();
      ctx.fillStyle = gloss(ctx, 0, -0.8, 0, 0.8, "#5a5f62", "#1c1f21");
      ctx.fill();
      outline(ctx, 0.04);
      ctx.restore();
      if (Math.sin(t * 14) > 0) {
        ctx.globalCompositeOperation = "lighter";
        glows.add(ctx, THEME.bad, x - 0.15, y - 0.82, 0.2, 1);
        glows.add(ctx, THEME.ok, x - 0.15, y + 0.82, 0.2, 1);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      }
    }
  },
};
