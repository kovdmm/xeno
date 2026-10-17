import type { Layer } from "../types";
import { drawTowerBase } from "./towers";

/** The ground with its gore decals and the plates of the towers, shifted by the screen shake. */
export const floorLayer: Layer = {
  id: "floor",
  draw(f) {
    const { ctx, floor, proj } = f;
    floor.compose((c) => {
      for (const tw of f.world.S.towers) drawTowerBase(f, tw, c);
    });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(floor.floor!, proj.ox, proj.oy);
  },
};
