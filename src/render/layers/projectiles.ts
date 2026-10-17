import { outline } from "../primitives";
import { TAU } from "../theme";
import type { Layer } from "../types";

/** The bodies of projectiles. */
export const projectiles: Layer = {
  id: "projectiles",
  draw(fc) {
    const { ctx, world: C } = fc;
    const S = C.S;
    for (const p of S.proj) {
      const x = p.x + 0.5,
        y = p.y + 0.5;
      if (p.k === "s") {
        ctx.fillStyle = "#1a1410";
        ctx.beginPath();
        ctx.arc(x, y, p.big ? 0.12 : 0.07, 0, TAU);
        ctx.fill();
      } else if (p.k === "m") {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.ang);
        ctx.fillStyle = "#d8d8d8";
        ctx.fillRect(-0.12, -0.035, 0.22, 0.07);
        ctx.fillStyle = "#ff3b3b";
        ctx.fillRect(0.08, -0.035, 0.05, 0.07);
        ctx.restore();
      } else if (p.k === "a" && p.f >= 0) {
        ctx.fillStyle = "rgba(0,0,0,.4)";
        ctx.beginPath();
        ctx.ellipse(x, y, 0.15, 0.08, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#2a241c";
        ctx.beginPath();
        ctx.arc(x, y - p.h, (p.nuke ? 0.17 : 0.11) + p.h * 0.04, 0, TAU);
        ctx.fill();
        outline(ctx, 0.025);
      }
    }
  },
};
