// What the renderer should show on top of the game state: the selected tower, the ghost of a tower being
// placed (green when it may go there, red when not), the aiming shape of an ability.
import type { View } from "../render/types";
import type { UiState } from "./state";
import type { Core } from "./types";

export function buildView(core: Core, st: UiState, clock: number): View {
  const s = core.S,
    v: View = { t: clock, sel: st.sel, preview: null, aim: null, building: !!st.build };
  if (st.hover && st.build && !s.over) {
    const d = core.TT[st.build],
      z = d.size || 1,
      [x, y] = core.buildOrigin(st.build, st.hover),
      why = core.placeCheck(x, y, z);
    if (why !== "busy" && why !== "out")
      v.preview = {
        type: st.build,
        x,
        y,
        size: z,
        ok: !why && s.credits >= d.cost[0],
        range: d.range[0],
        minR: d.minR || 0,
      };
  }
  if (st.hover && st.aim && !s.over) {
    const a = core.AB[st.aim];
    if (a.aim) v.aim = { shape: a.aim, x: st.hover[0], y: st.hover[1], r: a.r ?? 0 };
  }
  return v;
}
