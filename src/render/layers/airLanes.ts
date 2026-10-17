import { alpha } from "../color";
import { THEME } from "../theme";
import { laneOf } from "../gates";
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
      // a band along the straight line a flyer takes, from the board edge at the entrance to the one at the exit
      const lane = laneOf(C.ROUTES[r]);
      ctx.save();
      ctx.translate(lane.from[0], lane.from[1]);
      ctx.rotate(lane.angle);
      ctx.fillStyle = alpha(THEME.enemy.flyer, a);
      ctx.fillRect(0, -1.2, lane.length, 2.4);
      ctx.strokeStyle = alpha(THEME.enemy.flyer, 0.4);
      ctx.strokeRect(0, -1.2, lane.length, 2.4);
      ctx.restore();
    }
    ctx.restore();
  },
};
