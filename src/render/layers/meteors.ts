import { alpha } from "../color";
import { TAU, THEME } from "../theme";
import type { Layer } from "../types";

/** Meteors and bombs falling in. */
export const meteors: Layer = {
  id: "meteors",
  draw(fc) {
    const { ctx, world: C, glows, proj } = fc;
    const S = C.S;
    for (const m of S.meteors) {
      if (m.t > 0) continue;
      const f = Math.min(1, -m.t / m.fall),
        big = m.kind === "meteor",
        q = 1 - f,
        mx = m.x + 0.5 - (proj.rot ? q * 4 : q * 2),
        my = m.y + 0.5 + (proj.rot ? q * 2 : -q * 4);
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.beginPath();
      ctx.ellipse(m.x + 0.5, m.y + 0.5, 0.28 * f, 0.15 * f, 0, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      ctx.strokeStyle = alpha(big ? THEME.fire : THEME.accent, 0.5);
      ctx.lineWidth = big ? 0.18 : 0.08;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(proj.rot ? mx - 1.2 : mx - 0.6, proj.rot ? my + 0.6 : my - 1.2);
      ctx.lineTo(mx, my);
      ctx.stroke();
      glows.add(ctx, big ? THEME.fire : THEME.accent, mx, my, big ? 0.5 : 0.25, 1);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#2a1a10";
      ctx.beginPath();
      ctx.arc(mx, my, big ? 0.13 : 0.07, 0, TAU);
      ctx.fill();
    }
  },
};
