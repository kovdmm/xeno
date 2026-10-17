// The renderer wired to the browser: canvases, the pixel ratio, the motion preference, the clock.
import { createRenderer, type Renderer, type RendererOptions } from "./renderer";
import type { World } from "./types";

export interface BrowserRendererOptions {
  /** random stream for the cosmetic effects (tests seed it) */
  rand?: () => number;
  /** time in ms (tests drive it by hand) */
  clock?: () => number;
}

/** A function that makes a renderer for a canvas. */
export function browserRenderer(
  world: World,
  o: BrowserRendererOptions = {},
): (canvas: HTMLCanvasElement, options?: RendererOptions) => Renderer {
  const rand = o.rand || Math.random;
  const clock = o.clock || (() => performance.now());
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (canvas, options) =>
    createRenderer(
      canvas,
      {
        world,
        rand,
        clock,
        reduceMotion,
        createCanvas: () => document.createElement("canvas"),
        devicePixelRatio: () => window.devicePixelRatio || 1,
      },
      options,
    );
}
