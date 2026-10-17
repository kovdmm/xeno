import { alpha } from "../color";
import { TAU, THEME } from "../theme";
import type { Layer } from "../types";

/** The range of the selected tower. */
export const towerRange: Layer = {
  id: "towerRange",
  draw(fc) {
    const { ctx, world: C, t } = fc;
    const sel = fc.view.sel;
    if (sel) {
      const s = C.stats(sel);
      ctx.fillStyle = alpha(THEME.range, 0.07);
      ctx.beginPath();
      ctx.arc(sel.x + 0.5, sel.y + 0.5, s.range, 0, TAU);
      ctx.fill();
      ctx.save();
      ctx.setLineDash([0.25, 0.15]);
      ctx.lineDashOffset = t * 0.5;
      ctx.strokeStyle = alpha(THEME.range, 0.8);
      ctx.lineWidth = 0.045;
      ctx.stroke();
      ctx.restore();
      if (s.minR) {
        ctx.setLineDash([0.15, 0.15]);
        ctx.strokeStyle = alpha(THEME.bad, 0.7);
        ctx.beginPath();
        ctx.arc(sel.x + 0.5, sel.y + 0.5, s.minR, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  },
};
