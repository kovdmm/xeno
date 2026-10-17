import { alpha } from "../color";
import { TAU, THEME } from "../theme";
import type { Layer } from "../types";
import { towerVector } from "../towers";

/** The ghost of the tower being placed with its range. */
export const placementPreview: Layer = {
  id: "placementPreview",
  draw(fc) {
    const { ctx } = fc;
    const view = fc.view;
    const pv = view.preview;
    if (pv) {
      const z = pv.size,
        ccx = pv.x + (z - 1) / 2 + 0.5,
        ccy = pv.y + (z - 1) / 2 + 0.5,
        col = pv.ok ? THEME.ok : THEME.bad;
      ctx.fillStyle = alpha(col, 0.07);
      ctx.beginPath();
      ctx.arc(ccx, ccy, pv.range, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = alpha(col, 0.7);
      ctx.lineWidth = 0.04;
      ctx.stroke();
      if (pv.minR) {
        ctx.setLineDash([0.15, 0.15]);
        ctx.beginPath();
        ctx.arc(ccx, ccy, pv.minR, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.globalAlpha = 0.6;
      ctx.save();
      ctx.translate(ccx, ccy);
      if (z > 1) ctx.scale(z, z);
      towerVector(ctx, pv.type, 0, -Math.PI / 2, -1);
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.07;
      ctx.strokeRect(pv.x + 0.04, pv.y + 0.04, z - 0.08, z - 0.08);
    }
  },
};
