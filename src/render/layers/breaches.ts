import { gateGeometry } from "../gates";
import { THEME } from "../theme";
import type { Layer } from "../types";

/** The hive breaches breathe and the gate lights blink; both sit where the route data puts the gates. */
export const breaches: Layer = {
  id: "breaches",
  draw(fc) {
    const { ctx, world: C, t, glows } = fc;
    ctx.globalCompositeOperation = "lighter";
    for (const r of Object.values(C.ROUTES)) {
      const g = gateGeometry(r);
      glows.add(
        ctx,
        THEME.hiveGlow,
        g.spawn[0],
        g.spawn[1],
        (1.8 + 0.2 * Math.sin(t * 2.2)) * g.span,
        0.35 + 0.15 * Math.sin(t * 2.2),
      );
      // the warning light beside the exit, on the side of the road
      if (Math.sin(t * 4) > 0.2)
        glows.add(ctx, THEME.bad, g.exit[0] + g.exitDir[1] * 1.6, g.exit[1] + g.exitDir[0] * 1.6, 0.45, 0.8);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },
};
