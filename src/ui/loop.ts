// The main loop: advances the game in small fixed steps, draws, feeds the sound and refreshes the panels.
import type { UiContext } from "./context";
import { speedOf } from "./state";
import { buildView } from "./view";

/** The game is stepped in pieces of at most this many seconds, so a long frame cannot skip over events. */
const MAX_STEP = 0.025;
/** A frame longer than this (a hidden tab, a debugger) counts as this long. */
const MAX_FRAME = 0.05;
/** The panels are refreshed this often, seconds. */
const PANEL_EVERY = 0.1;

export function startLoop(ui: UiContext) {
  const { core: C, state: st } = ui;
  let last = performance.now(),
    uiAcc = 0,
    clock = 0;

  function frame(now: number) {
    const rdt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    const sp = speedOf(st),
      dt = rdt * sp;
    if (!C.S.over && dt > 0) {
      let rem = dt;
      while (rem > 0) {
        const step = Math.min(MAX_STEP, rem);
        C.step(step);
        rem -= step;
      }
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
