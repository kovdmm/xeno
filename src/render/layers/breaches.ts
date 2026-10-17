import { THEME } from "../theme";
import type { Layer } from "../types";

/** The hive breaches breathe and the gate lights blink. */
export const breaches: Layer = {
  id: "breaches",
  draw(fc) {
    const { ctx, world: C, t, glows } = fc;
    ctx.globalCompositeOperation = "lighter";
    for (const r of Object.values(C.ROUTES)) {
      const [x, y] = r.spawn[1];
      glows.add(ctx, THEME.hiveGlow, x + 0.5, y + 0.5, 1.8 + 0.2 * Math.sin(t * 2.2), 0.35 + 0.15 * Math.sin(t * 2.2));
      const ex = r.exit[1];
      if (Math.sin(t * 4) > 0.2)
        glows.add(ctx, THEME.bad, ex[0] + 0.5 + r.dir[1] * 1.6, ex[1] + 0.5 + r.dir[0] * 1.6, 0.45, 0.8);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },
};
