// What the game puts on the page (window.XT is a debugging handle) and what the test harness adds to it.
import type { App } from "../src/app";
import type { GameCore } from "../src/core";

declare global {
  interface XTHandle extends App {
    core: GameCore;
    ui: { newGame(): void; refresh(): void; openMenu(): void };
  }
  /** the game, inside page.evaluate callbacks */
  const XT: XTHandle;
  interface Window {
    XT: XTHandle;
    /** advances the manual clock by n frames of 1/60 s (see harness.ts) */
    __tick(n?: number): void;
  }
}
export {};
