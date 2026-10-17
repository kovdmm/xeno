import { alpha } from "../color";
import { THEME } from "../theme";
import type { Layer } from "../types";

/** The marching paths of ground enemies (dashes crawl along them). */
export const routes: Layer = {
  id: "routes",
  draw(fc) {
    const { ctx, world: C, t } = fc;
    const drawPath = (r: "h" | "v") => {
      const p = C.routePath(r);
      ctx.beginPath();
      p.forEach(([x, y], i) => ctx[i ? "lineTo" : "moveTo"](x + 0.5, y + 0.5));
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = alpha(THEME.path, 0.14);
      ctx.lineWidth = 0.32;
      ctx.stroke();
      ctx.setLineDash([0.12, 0.38]);
      ctx.lineDashOffset = -t * 1.2;
      ctx.strokeStyle = alpha(THEME.path, 0.8);
      ctx.lineWidth = 0.1;
      ctx.stroke();
      ctx.setLineDash([]);
    };
    drawPath("h");
    drawPath("v");
  },
};
