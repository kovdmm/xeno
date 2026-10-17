import { alpha } from "../color";
import { TAU, THEME } from "../theme";
import type { Layer } from "../types";

/** The aiming circle or row of an ability. */
export const abilityAim: Layer = {
  id: "abilityAim",
  draw(fc) {
    const { ctx, world: C, t } = fc;
    const view = fc.view,
      W = C.W;
    const am = view.aim;
    if (am) {
      ctx.strokeStyle = alpha(THEME.fire, 0.95);
      ctx.fillStyle = alpha(THEME.fire, 0.12);
      ctx.lineWidth = 0.06;
      ctx.setLineDash([0.3, 0.15]);
      ctx.lineDashOffset = -t;
      if (am.shape === "row") {
        const y = Math.round(am.y - 0.5);
        ctx.fillRect(0, y - 0.5, W, 2);
        ctx.strokeRect(0, y - 0.5, W, 2);
      } else {
        ctx.beginPath();
        ctx.arc(am.x, am.y, am.r, 0, TAU);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(am.x - 0.4, am.y);
        ctx.lineTo(am.x + 0.4, am.y);
        ctx.moveTo(am.x, am.y - 0.4);
        ctx.lineTo(am.x, am.y + 0.4);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }
  },
};
