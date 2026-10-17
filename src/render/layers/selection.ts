import { alpha } from "../color";
import { TAU, THEME } from "../theme";
import type { Layer } from "../types";

/** A pulsing ring around the selected tower. */
export const selection: Layer = {
  id: "selection",
  draw(fc) {
    const { ctx, t, glows } = fc;
    const sel = fc.view.sel;
    if (sel) {
      const z = sel.size || 1,
        cx = sel.x + 0.5,
        cy = sel.y + 0.5,
        p = 0.5 + 0.5 * Math.sin(t * 5);
      ctx.globalCompositeOperation = "lighter";
      glows.add(ctx, THEME.range, cx, cy, 0.95 * z + 0.1 * p, 0.12 + 0.1 * p, true);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = alpha(THEME.range, 0.6 + 0.4 * p);
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.arc(cx, cy, 0.6 * z + 0.04 * p, 0, TAU);
      ctx.stroke();
    }
  },
};
