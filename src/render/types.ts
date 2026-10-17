// What the renderer needs to know about the rest of the app, and the shape of one frame.
import type {
  Creep,
  EnemyDef,
  GameEvent,
  Route,
  RouteKey,
  State,
  Tower,
  TowerStats,
  TowerType,
  Vec,
} from "../game/types";
import type { Fx } from "./fx";
import type { Floor } from "./floor";
import type { Glows } from "./glow";
import type { Projection } from "./projection";
import type { SpriteCache } from "./sprites";

export type Ctx = CanvasRenderingContext2D;

/** The part of the game the renderer reads. It never writes any of it. */
export interface World {
  readonly W: number;
  readonly H: number;
  readonly ROUTES: Record<RouteKey, Route>;
  /** cells of walls: stone the enemies walk around and nothing can be built on */
  readonly WALLS: Vec[];
  readonly ET: Record<string, EnemyDef & { fly?: number }>;
  /** the specialisations of each tower type, in order (their order picks the colour) */
  readonly TT: Record<string, { ults: Record<string, unknown> }>;
  readonly S: State;
  on(fn: (e: GameEvent) => void): () => void;
  stats(t: Tower): TowerStats;
  routePath(r: RouteKey): Vec[];
  pos(c: Creep): Vec;
}

export interface Preview {
  type: TowerType;
  x: number;
  y: number;
  size: number;
  ok: boolean;
  range: number;
  minR?: number;
}
export interface Aim {
  shape: "row" | "circle";
  x: number;
  y: number;
  r: number;
}
/** What the UI wants shown on top of the game this frame. */
export interface View {
  t: number;
  sel: Tower | null;
  preview: Preview | null;
  aim: Aim | null;
  building?: boolean;
}

/** Everything a layer may use. Layers read it and draw; they do not keep frame-to-frame state in it. */
export interface FrameContext {
  readonly ctx: Ctx;
  readonly canvas: HTMLCanvasElement;
  readonly world: World;
  readonly view: View;
  /** seconds, for animation */
  readonly t: number;
  readonly dt: number;
  readonly proj: Projection;
  readonly sprites: SpriteCache;
  readonly glows: Glows;
  readonly fx: Fx;
  readonly floor: Floor;
  readonly rand: () => number;
}

/**
 * One slice of the picture. A layer draws in board space (the projection matrix is set before it runs, and
 * the canvas state is saved and restored around it), so it can be replaced or reordered on its own.
 */
export interface Layer {
  readonly id: string;
  draw(f: FrameContext): void;
}
