// Everything the player presses: the field (pointer), the keyboard and the buttons of the main screens.
import type { Vec } from "../game/types";
import type { Commands } from "./commands";
import type { UiContext } from "./context";
import { CheatTyper, escapeAction, hotkey, physicalDigit, physicalLetter, spaceAction, type OpenScreens } from "./keys";
import { clearPicks } from "./state";

export interface InputDeps {
  commands: Commands;
  /** the screens' own actions */
  menu: { open(): void; newGame(): void; openSettings(): void; openHelp(): void };
  credits: { close(): void };
  toggleSound(): void;
  closeScreen(id: "settings" | "help"): void;
}

export function installInput(ui: UiContext, d: InputDeps) {
  const { core: C, state: st, t, $, screens } = ui;
  const cv = $<HTMLCanvasElement>("field");
  const cmd = d.commands;

  /* ---------- the field ---------- */
  // screen point to board cells; in portrait the board is turned 90 degrees clockwise
  function pointAt(e: PointerEvent | MouseEvent): Vec {
    const r = cv.getBoundingClientRect(),
      u = (e.clientX - r.left) / r.width,
      v = (e.clientY - r.top) / r.height;
    return st.rotated ? [v * C.W, C.H - u * C.H] : [u * C.W, v * C.H];
  }
  cv.addEventListener("pointermove", (e) => {
    st.hover = pointAt(e);
  });
  cv.addEventListener("pointerleave", (e) => {
    if (e.pointerType === "mouse") st.hover = null;
  });
  cv.addEventListener("click", (e) => {
    if (C.S.over || st.paused) return;
    const pt = pointAt(e),
      x = Math.floor(pt[0]),
      y = Math.floor(pt[1]);
    if (x < 0 || y < 0 || x >= C.W || y >= C.H) return;
    st.hover = pt;
    if (st.aim) {
      if (cmd.cast(st.aim, pt)) st.aim = null;
      ui.refresh();
      return;
    }
    const tw = C.towerAt(x, y);
    if (tw) {
      st.sel = st.sel === tw ? null : tw;
      st.build = null;
    } else if (st.build) cmd.placeAt(pt);
    else st.sel = null;
    ui.refresh();
  });
  cv.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    clearPicks(st);
    ui.refresh();
  });

  /* ---------- the keyboard ---------- */
  const cheats = new CheatTyper(["hesoyam"], (code) => {
    if (!C.cheat(code)) ui.toast(t("cheatBad"));
  });
  const open = (): OpenScreens => ({
    settings: screens.isOpen("settings"),
    help: screens.isOpen("help"),
    pause: screens.isOpen("pause"),
    menu: screens.isOpen("menu"),
    over: screens.isOpen("over"),
  });

  document.addEventListener("keydown", (e) => {
    const target = e.target as Element | null;
    if (target?.closest && target.closest("input,textarea,select")) return;
    // browser shortcuts (Ctrl+S, Ctrl+R, Alt+F ...) are not for the game; a held key does not repeat its action
    if (!e.key || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (screens.isOpen("credits")) {
      if (e.key === "Escape" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        d.credits.close();
      }
      return;
    }
    // cheat codes use the physical keys, so any layout works
    const kc = physicalLetter(e.code);
    if (kc && cheats.feed(kc)) {
      e.preventDefault();
      return;
    }
    const k = physicalDigit(e.code) || hotkey(e.key);
    if (k === "m") {
      d.toggleSound();
      return;
    }
    if (k === "escape") {
      switch (escapeAction(open(), !!(st.build || st.sel || st.aim))) {
        case "close-settings":
          d.closeScreen("settings");
          break;
        case "close-help":
          d.closeScreen("help");
          break;
        case "resume":
          screens.hide("pause");
          break;
        case "clear-picks":
          clearPicks(st);
          ui.refresh();
          break;
        case "pause":
          screens.show("pause");
          break;
      }
      return;
    }
    if (st.paused && k !== " ") return;
    const tk = C.TKEYS.find((n) => C.TT[n].key === k);
    if (tk) {
      cmd.selectBuild(tk);
      return;
    }
    const ak = C.AKEYS.find((n) => C.AB[n].key === k);
    if (ak) {
      cmd.selectAbility(ak);
      return;
    }
    if (k === "u") {
      if (st.sel && st.sel.lvl !== 3) cmd.upgrade();
      else if (st.sel) ui.toast(t("pickUltPanel"));
    } else if (k === "s") cmd.sell();
    else if (k === "n") cmd.goBtn();
    else if (k === "f") cmd.cycleSpeed();
    else if (k === " ") {
      e.preventDefault();
      const a = spaceAction(open());
      if (a === "resume") screens.hide("pause");
      else if (a === "pause") screens.show("pause");
    } else return;
    ui.refresh();
  });

  /* ---------- buttons ---------- */
  $("speedBtn").addEventListener("click", cmd.cycleSpeed);
  $("go").addEventListener("click", cmd.goBtn);
  $("info").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-act]");
    if (!b) return;
    const a = b.dataset.act;
    if (a === "up") cmd.upgrade(b.dataset.u);
    else if (a === "sell") cmd.sell();
    else if (a === "cancel") clearPicks(st);
    ui.refresh();
  });

  // the title, pause and end screens
  const go = (fn: () => void) => () => {
    fn();
    ui.refresh();
  };
  $("mPlay").addEventListener(
    "click",
    go(() => {
      if (C.S.over) d.menu.newGame();
      screens.hide("menu");
    }),
  );
  $("mNew").addEventListener(
    "click",
    go(() => {
      d.menu.newGame();
      screens.hide("menu");
    }),
  );
  $("mLevel").addEventListener("click", d.menu.openSettings);
  $("mDiff").addEventListener("click", d.menu.openSettings);
  $("mSettings").addEventListener("click", d.menu.openSettings);
  $("mHelp").addEventListener("click", d.menu.openHelp);
  $("pauseBtn").addEventListener("click", () => screens.show("pause"));
  $("pResume").addEventListener("click", () => screens.hide("pause"));
  $("pRestart").addEventListener(
    "click",
    go(() => {
      d.menu.newGame();
      screens.hide("pause");
    }),
  );
  $("pSettings").addEventListener("click", d.menu.openSettings);
  $("pHelp").addEventListener("click", d.menu.openHelp);
  $("pMenu").addEventListener("click", d.menu.open);
  $("restart").addEventListener("click", go(d.menu.newGame));
  $("overMenu").addEventListener("click", () => {
    screens.hide("over");
    d.menu.open();
  });
  $("overDiff").addEventListener("click", d.menu.openSettings);
}
