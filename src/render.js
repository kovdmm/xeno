/* Xeno-Tactic — canvas renderer, "derelict colony" look in the spirit of old Flash games:
   grimy metal deck, organic hive breaches, glossy outlined aliens, gore decals, additive glow.
   It reads XT.core.S (never writes it) and turns core events into effects.
   API: XT.createRenderer(canvas) → {resize, draw(view, dt), towerIcon(ctx, type), setRotated, theme, ...}.
   The renderer itself is src/render/: layers (src/render/layers), sprite painters, effects, floor. This file
   only hands it what lives outside: the game, the seeded random stream, the clock and the browser. */
import { createRenderer } from "./render/renderer";
import { THEME } from "./render/theme";

export function installRender(XT) {
  // Randomness comes from XT.rng.fx when set (tests seed it); each module has its own stream so that
  // cosmetic randomness never shifts the game simulation.
  const rand = (XT.rng && XT.rng.fx) || Math.random;
  const clock = (XT.env && XT.env.now) || (() => performance.now());
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  XT.createRenderer = (canvas, options) =>
    createRenderer(
      canvas,
      {
        world: XT.core,
        rand,
        clock,
        reduceMotion,
        createCanvas: () => document.createElement("canvas"),
        devicePixelRatio: () => window.devicePixelRatio || 1,
      },
      options,
    );
  XT.THEME = THEME;
}
