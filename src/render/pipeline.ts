// The layer pipeline: which layers there are and in what order. The default composition is a plain list,
// and changing it is a plain function of that list, so a variant of the picture is one expression:
//
//   withLayers(DEFAULT_LAYERS, { replace: { beams: myBeams }, remove: ["flicker"], after: { towers: [glowRing] } })
import type { FrameContext, Layer } from "./types";
import { breaches } from "./layers/breaches";
import { fireZones } from "./layers/fireZones";
import { routes } from "./layers/routes";
import { airLanes } from "./layers/airLanes";
import { towerRange } from "./layers/towerRange";
import { selection } from "./layers/selection";
import { towers } from "./layers/towers";
import { groundCreeps, airCreeps } from "./layers/creeps";
import { beams } from "./layers/beams";
import { projectileGlow } from "./layers/projectileGlow";
import { projectiles } from "./layers/projectiles";
import { meteors } from "./layers/meteors";
import { bombers } from "./layers/bombers";
import { nukes } from "./layers/nukes";
import { particles } from "./layers/particles";
import { rewards } from "./layers/rewards";
import { bubbles } from "./layers/bubbles";
import { placementPreview } from "./layers/placementPreview";
import { abilityAim } from "./layers/abilityAim";
import { floorLayer } from "./layers/floor";
import { stasisTint, flicker, leakVignette, whiteFlash } from "./layers/overlays";

/** Bottom to top. */
export const DEFAULT_LAYERS: readonly Layer[] = [
  floorLayer,
  breaches,
  fireZones,
  routes,
  airLanes,
  towerRange,
  towers,
  selection,
  groundCreeps,
  beams,
  projectileGlow,
  projectiles,
  airCreeps,
  meteors,
  bombers,
  nukes,
  particles,
  rewards,
  bubbles,
  placementPreview,
  abilityAim,
  stasisTint,
  flicker,
  leakVignette,
  whiteFlash,
];

export interface LayerEdit {
  /** swap the layer with this id for another one (it keeps its place) */
  replace?: Record<string, Layer>;
  /** drop layers by id */
  remove?: string[];
  /** put layers right after the layer with this id */
  after?: Record<string, Layer[]>;
  /** put layers right before the layer with this id */
  before?: Record<string, Layer[]>;
}

/** A new list made from `base`; unknown ids are an error, so a typo cannot silently do nothing. */
export function withLayers(base: readonly Layer[], edit: LayerEdit): Layer[] {
  const ids = new Set(base.map((l) => l.id));
  const known = (id: string) => {
    if (!ids.has(id)) throw new Error(`no layer "${id}" (have: ${[...ids].join(", ")})`);
  };
  for (const id of [
    ...Object.keys(edit.replace ?? {}),
    ...(edit.remove ?? []),
    ...Object.keys(edit.after ?? {}),
    ...Object.keys(edit.before ?? {}),
  ])
    known(id);
  const out: Layer[] = [];
  for (const l of base) {
    if (edit.remove?.includes(l.id)) continue;
    out.push(...(edit.before?.[l.id] ?? []));
    out.push(edit.replace?.[l.id] ?? l);
    out.push(...(edit.after?.[l.id] ?? []));
  }
  const seen = new Set<string>();
  for (const l of out) {
    if (seen.has(l.id)) throw new Error(`layer id "${l.id}" is used twice`);
    seen.add(l.id);
  }
  return out;
}

/**
 * Draws the layers in order. Each one runs with the board matrix set and the canvas state saved and
 * restored around it, so a layer cannot leave a dash pattern or a blend mode behind for the next one.
 */
export function runLayers(layers: readonly Layer[], f: FrameContext) {
  // the house pen: round caps and joins unless a layer says otherwise
  f.ctx.lineCap = "round";
  f.ctx.lineJoin = "round";
  for (const l of layers) {
    f.ctx.save();
    f.proj.apply(f.ctx, f.proj.ox, f.proj.oy);
    l.draw(f);
    f.ctx.restore();
  }
}
