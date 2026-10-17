// Fitting the field to the window: which orientation the board takes and how big the field is.
import type { UiContext } from "./context";
import type { Palette } from "./palette";

/** A mouse and a big enough window, whatever the window shape. */
export const DESK_QUERY = "(min-width:980px) and (min-height:560px) and (hover:hover) and (pointer:fine)";

/** Room for the frame around the field, px. */
const PAD = 10;
/** On desktop the board is turned only if that makes it at least this much bigger. */
const TURN_GAIN = 1.08;

/** The largest w×h with the given aspect ratio that fits in sw×sh. */
export function fitAspect(sw: number, sh: number, aspect: number): [number, number] {
  let w = sw,
    h = w / aspect;
  if (h > sh) {
    h = sh;
    w = h * aspect;
  }
  return [w, h];
}

/** Desktop: turn the board only if that makes it noticeably bigger in this window. */
export function turnsOnDesktop(sw: number, sh: number, W: number, H: number): boolean {
  return Math.min(sw / H, sh / W) > Math.min(sw / W, sh / H) * TURN_GAIN;
}

export function installLayout(ui: UiContext, palette: Palette, deskMQ: MediaQueryList, afterTurn: () => void) {
  const { core: C, state: st, $ } = ui;
  const app = $("app"),
    stage = $("stage"),
    fw = $("fw"),
    hdr = $("hdr"),
    dock = $("dock");

  const portrait = matchMedia("(orientation:portrait)");
  let palH = 0;

  function fit() {
    let w: number, h: number;
    let rot = portrait.matches;
    if (ui.isDesk()) rot = turnsOnDesktop(stage.clientWidth - PAD, stage.clientHeight - PAD, C.W, C.H);
    if (rot !== st.rotated) {
      st.rotated = rot;
      ui.renderer.setRotated(rot);
      // texts that mention directions were built for the old orientation: the palette tooltips and both panels
      afterTurn();
    }
    const ar = rot ? C.H / C.W : C.W / C.H; // width / height of the field on screen
    if (ui.isDesk()) {
      [w, h] = fitAspect(stage.clientWidth - PAD, stage.clientHeight - PAD, ar);
    } else if (rot) {
      const pal = $("pal");
      if (!pal.hidden && pal.offsetHeight)
        palH =
          (dock.children[0] as HTMLElement).offsetHeight +
          (dock.children[1] as HTMLElement).offsetHeight +
          pal.offsetHeight +
          12;
      const need = Math.max(palH || 0, 170);
      const gap = 8,
        avail = app.clientHeight - hdr.offsetHeight - need - gap * 2 - PAD;
      w = stage.clientWidth - PAD;
      h = w / ar;
      if (h > avail) {
        h = Math.max(160, avail);
        w = h * ar;
      }
    } else {
      [w, h] = fitAspect(stage.clientWidth - PAD, stage.clientHeight - PAD, ar);
    }
    fw.style.width = Math.floor(w) + "px";
    fw.style.height = Math.floor(h) + "px";
    palette.fitNames(); // the palette may have changed size with the layout
  }

  const refit = () => requestAnimationFrame(fit);
  // another level has another board: fit the field to it
  C.on((e) => {
    if (e.type === "reset") refit();
  });
  new ResizeObserver(fit).observe(app);
  portrait.addEventListener?.("change", refit);
  deskMQ.addEventListener?.("change", () => {
    document.body.classList.toggle("desk", deskMQ.matches);
    ui.invalidate();
    ui.refresh();
    refit();
  });
  document.body.classList.toggle("desk", deskMQ.matches);

  return { fit, refit };
}
