import { alpha } from "../color";
import { THEME } from "../theme";
import { mid } from "../../game/constants";
import type { RouteKey } from "../../game/types";
import type { Layer } from "../types";

/** Faint lanes along which flyers are coming. */
export const airLanes: Layer = {
  id: "airLanes",
  draw(fc) {
    const { ctx, world: C, t } = fc;
    const S = C.S;
    const lanes = new Set<RouteKey>();
    for (const c of S.creeps) if (c.fly && !c.dead) lanes.add(c.route);
    for (const sp of S.spawners) for (const e of sp.list) if (C.ET[e.type].fly) lanes.add(e.route);
    if (!lanes.size) return;
    const a = 0.06 + 0.03 * Math.sin(t * 4);
    ctx.save();
    ctx.setLineDash([0.3, 0.2]);
    ctx.lineDashOffset = -t;
    ctx.lineWidth = 0.04;
    for (const r of lanes) {
      const R = C.ROUTES[r],
        m = mid(R.spawn);
      const rect: [number, number, number, number] = R.dir[0]
        ? [0, m[1] + 0.5 - 1.2, C.W, 2.4]
        : [m[0] + 0.5 - 1.2, 0, 2.4, C.H];
      ctx.fillStyle = alpha(THEME.enemy.flyer, a);
      ctx.fillRect(...rect);
      ctx.strokeStyle = alpha(THEME.enemy.flyer, 0.4);
      ctx.strokeRect(...rect);
    }
    ctx.restore();
  },
};
