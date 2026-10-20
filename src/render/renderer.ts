// The renderer: builds the parts (projection, sprite cache, effects, floor, quality governor) and, every frame,
// runs the layer pipeline over them. The look of the picture lives in the layers and sprite painters;
// what happens (particles, shake, decals) is calculated by Fx and the director; this file only wires them.
import type { TowerType } from "../game/types";
import { createFxDirector } from "./director";
import { Floor } from "./floor";
import { Fx } from "./fx";
import { Glows } from "./glow";
import { DEFAULT_LAYERS, runLayers } from "./pipeline";
import { Projection } from "./projection";
import { QualityGovernor } from "./quality";
import { SpriteCache } from "./sprites";
import { THEME } from "./theme";
import { tierColor } from "./tiers";
import { lvK, towerVector } from "./towers";
import type { Ctx, FrameContext, Layer, View, World } from "./types";

/** Everything the renderer takes from outside, so tests can replace it. */
export interface RendererDeps {
  world: World;
  /** cosmetic randomness (its own stream: it never shifts the simulation) */
  rand: () => number;
  /** time in ms, for the quality governor */
  clock: () => number;
  reduceMotion: boolean;
  createCanvas: () => HTMLCanvasElement;
  devicePixelRatio: () => number;
}

export interface RendererOptions {
  /** the layer composition, bottom to top; see `withLayers` */
  layers?: readonly Layer[];
}

export function createRenderer(canvas: HTMLCanvasElement, deps: RendererDeps, options: RendererOptions = {}) {
  const { world, rand, clock, createCanvas } = deps;
  const ctx = canvas.getContext("2d")!;
  const proj = new Projection(world.W, world.H);
  const governor = new QualityGovernor();
  const fx = new Fx(() => governor.settings, rand, deps.reduceMotion);
  const sprites = new SpriteCache(proj, createCanvas);
  const glows = new Glows(createCanvas);
  const floor = new Floor(world, proj, canvas, createCanvas, rand);
  let layers: readonly Layer[] = options.layers ?? DEFAULT_LAYERS;

  world.on(createFxDirector(fx, floor));

  function resize() {
    const r = canvas.getBoundingClientRect(),
      dpr = Math.min(2, deps.devicePixelRatio() || 1);
    let w = Math.max(1, Math.round(r.width * dpr)),
      h = Math.max(1, Math.round(r.height * dpr));
    // keep phones fast: cap the backing store
    const k = Math.min(1, Math.sqrt(governor.settings.px / (w * h)));
    w = Math.round(w * k);
    h = Math.round(h * k);
    if (w === canvas.width && h === canvas.height && floor.ready) return;
    canvas.width = w;
    canvas.height = h;
    proj.cs = w / proj.cols;
    sprites.clear();
    floor.build();
    // a canvas that changed size is blank until painted: paint the last picture again at once, so the
    // window being resized never shows an empty frame
    if (lastView && !drawing) paint(lastView, 0);
  }

  let lastView: View | null = null;
  let drawing = false;

  function draw(view: View, dt: number) {
    lastView = view;
    drawing = true;
    // another level has another board: the floor, the decals and the sizes are made again
    if (proj.setBoard(world.W, world.H)) floor.invalidateAll();
    if (!floor.ready) resize();
    if (governor.tick(clock())) floor.invalidate();
    if (!floor.ready) resize();
    drawing = false;
    paint(view, dt);
  }

  /** One picture: advance the effects by dt and run the layers. */
  function paint(view: View, dt: number) {
    fx.step(dt, world, proj.rot);
    glows.reset(governor.settings.glow);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    floor.step(dt);
    proj.ox = proj.oy = 0;
    if (fx.shake > 0) {
      proj.ox = Math.round((rand() - 0.5) * fx.shake * 0.5 * proj.cs);
      proj.oy = Math.round((rand() - 0.5) * fx.shake * 0.5 * proj.cs);
    }
    const frame: FrameContext = { ctx, canvas, world, view, t: view.t, dt, proj, sprites, glows, fx, floor, rand };
    runLayers(layers, frame);
  }

  /** Turning the board drops the gore layer (it was painted in the old orientation). */
  function setRotated(v: boolean) {
    if (v === proj.rot) return;
    proj.rot = v;
    floor.invalidateAll();
  }

  const specOf = (type: TowerType, ult?: string) => (ult ? Object.keys(world.TT[type].ults).indexOf(ult) : -1);

  return {
    resize,
    draw,
    setRotated,
    /** The tower as a button icon, drawn into any 2D context at the origin of a unit square. */
    towerIcon(c: Ctx, type: TowerType) {
      c.save();
      c.translate(0.5, 0.5);
      c.scale(0.98 / lvK(1), 0.98 / lvK(1));
      towerVector(c, type, 1, -Math.PI / 4, -1);
      c.restore();
    },
    theme: THEME,
    tierColor: (l: number, type: TowerType, ult?: string) => tierColor(l, type, specOf(type, ult)),
    quality: () => governor.level,
    /** what the enemies say when the "crazytown" cheat is on (in the current language) */
    setPhrases(list: string[]) {
      fx.phrases = list;
    },
    /** the current layer composition, bottom to top */
    get layers(): readonly Layer[] {
      return layers;
    },
    setLayers(next: readonly Layer[]) {
      layers = next;
    },
  };
}

export type Renderer = ReturnType<typeof createRenderer>;
