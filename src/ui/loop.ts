// The main loop: advances the game in small fixed steps, draws, feeds the sound and refreshes the panels.
import { TICK } from "../game/constants";
import type { UiContext } from "./context";
import { speedOf } from "./state";
import { buildView } from "./view";

/** A frame longer than this (a hidden tab, a debugger) counts as this long. */
const MAX_FRAME = 0.05;
/** Rounding slack when the frame time is an exact multiple of the tick (60 Hz): 0.016666... must count as one tick. */
const TICK_SLACK = 1e-9;
/** The panels are refreshed this often, seconds. */
const PANEL_EVERY = 0.1;

export function startLoop(ui: UiContext) {
  const { core: C, state: st } = ui;
  let last = performance.now(),
    uiAcc = 0,
    clock = 0,
    /** game time that has not been stepped yet, seconds: less than one tick between frames */
    owed = 0;

  function frame(now: number) {
    const rdt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const sp = speedOf(st);
    ui.onFrame?.(rdt);
    // the game only ever advances in whole ticks (TICK), so a run is a number of ticks and can be replayed
    if (!C.S.over && sp > 0) {
      owed += rdt * sp;
      while (owed >= TICK - TICK_SLACK && !C.S.over) {
        C.step(TICK);
        owed -= TICK;
      }
      if (owed < 0) owed = 0;
    }
    clock += rdt;
    ui.renderer.draw(buildView(C, st, clock), sp ? rdt * Math.min(2, Math.max(1, sp * 0.7)) : rdt * 0.3);
    ui.sound.update(rdt, sp === 0 || C.S.over);
    uiAcc += rdt;
    if (uiAcc > PANEL_EVERY) {
      uiAcc = 0;
      ui.refresh();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
