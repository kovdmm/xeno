import { alpha } from "../color";
import { TAU, THEME } from "../theme";
import type { Layer } from "../types";

/** A nuke marker: blinking circle and hazard sign. */
export const nukes: Layer = {
  id: "nukes",
  draw(fc) {
    const { ctx, world: C, t } = fc;
    const S = C.S;
    for (const n of S.nukes) {
      const x = n.x + 0.5,
        y = n.y + 0.5,
        bl = Math.sin(t * 16) > 0;
      ctx.fillStyle = alpha(THEME.bad, bl ? 0.12 : 0.05);
      ctx.beginPath();
      ctx.arc(x, y, n.r, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = alpha(THEME.bad, bl ? 0.95 : 0.5);
      ctx.lineWidth = 0.07;
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t);
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * TAU) / 3;
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 0.6, a, a + 0.6);
        ctx.closePath();
      }
      ctx.fillStyle = alpha(THEME.hazard, 0.85);
      ctx.fill();
      ctx.restore();
    }
  },
};
