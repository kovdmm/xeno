import { THEME } from "../theme";
import type { Layer } from "../types";

/** The glow of shells, missiles and bullets in flight. */
export const projectileGlow: Layer = {
  id: "projectileGlow",
  draw(fc) {
    const { ctx, world: C, glows } = fc;
    const S = C.S;
    ctx.globalCompositeOperation = "lighter";
    for (const p of S.proj) {
      const x = p.x + 0.5,
        y = p.y + 0.5;
      if (p.k === "b") {
        glows.add(ctx, THEME.accent, x, y, p.big ? 0.2 : 0.14, 1);
      } else if (p.k === "s") {
        glows.add(ctx, THEME.fire, x, y, p.big ? 0.35 : 0.22, 0.8);
      } else if (p.k === "pl") {
        glows.add(ctx, THEME.tower.plasma, x, y, p.big ? 0.45 : 0.32, 1);
      } else if (p.k === "m") {
        glows.add(ctx, THEME.fire, x - Math.cos(p.ang) * 0.12, y - Math.sin(p.ang) * 0.12, 0.18, 1);
      } else if (p.k === "a" && p.f >= 0) {
        glows.add(ctx, p.nuke ? THEME.fire : THEME.accent, x, y - p.h, p.nuke ? 0.5 : 0.3, 0.9);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  },
};
