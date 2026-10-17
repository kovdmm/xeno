import { alpha } from "../color";
import { TAU } from "../theme";
import type { Layer } from "../types";

/** Scorched ground under napalm. */
export const fireZones: Layer = {
  id: "fireZones",
  draw(fc) {
    const { ctx, world: C } = fc;
    const S = C.S;
    for (const z of S.zones) {
      const a = Math.min(1, z.t / 1.5);
      ctx.fillStyle = alpha("#2a0800", 0.45 * a);
      ctx.beginPath();
      ctx.arc(z.x + 0.5, z.y + 0.5, z.r, 0, TAU);
      ctx.fill();
    }
  },
};
