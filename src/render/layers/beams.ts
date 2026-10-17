import { alpha } from "../color";
import { THEME } from "../theme";
import type { Layer } from "../types";

/** Laser beams, additive. */
export const beams: Layer = {
  id: "beams",
  draw(fc) {
    const { ctx, world: C, t, glows } = fc;
    const S = C.S;
    ctx.globalCompositeOperation = "lighter";
    for (const tw of S.towers)
      if (tw.beam)
        for (const c of tw.beam) {
          const w = Math.min(3, tw.heatM || 1) * (tw.lvl >= 4 ? 1.3 : 1),
            [cx, cy] = C.pos(c),
            col = (tw.heatM ?? 0) > 3 ? THEME.fire : THEME.tower.laser;
          ctx.globalAlpha = 1;
          ctx.strokeStyle = alpha(col, 0.35);
          ctx.lineCap = "round";
          ctx.lineWidth = (0.22 + 0.06 * Math.sin(t * 40)) * w;
          ctx.beginPath();
          ctx.moveTo(tw.x + 0.5, tw.y + 0.5);
          ctx.lineTo(cx + 0.5, cy + 0.5);
          ctx.stroke();
          ctx.strokeStyle = THEME.laserCore;
          ctx.lineWidth = 0.05 * w;
          ctx.stroke();
          glows.add(ctx, col, cx + 0.5, cy + 0.5, 0.35 * w, 0.9);
        }
    ctx.globalAlpha = 1;
  },
};
