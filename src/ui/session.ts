// The running session: starting a game, what the game's events do to the interface, the title screen,
// the pause and the end screens.
import { skullIcon } from "./difficulty";
import { mapThumb } from "./mapThumb";
import type { UiContext } from "./context";
import { CHEAT_TEXT, grumbles } from "./cheats";
import type { Progress } from "./progress";
import { clearPicks } from "./state";

export function createSession(
  ui: UiContext,
  progress: Progress,
  /** the length of the game changed with the level: texts that state it must be written again */
  onLengthChange: () => void,
  /** the highscore table's part: the server's seed for a new game, and what to do when a game has ended */
  scores: {
    takeSeed(level: string, diff: string): number | undefined;
    onEnd(): void;
    /** asks whether to save the finished game; true when it has, and `next` runs after the answer */
    ask(next: () => void): boolean;
  } = {
    takeSeed: () => undefined,
    onEnd: () => {},
    ask: () => false,
  },
) {
  const { core: C, state: st, t, L, $, screens } = ui;

  let length = C.FINAL;

  function newGame() {
    st.best = progress.bestOf(st.level, st.diff);
    C.newGame(st.diff, st.level, scores.takeSeed(st.level, st.diff));
    clearPicks(st);
    $("banner").hidden = false;
    $("banner").textContent = t("banner", { d: L(C.DIFF[st.diff]), f: C.FINAL });
    screens.hide("over");
    if (C.FINAL !== length) {
      length = C.FINAL;
      onLengthChange();
    }
  }

  /**
   * The server's seed arrived after the game was made, and the game is still untouched (nothing built, no wave
   * called, no cheat): start it over on that seed, so that it can be entered into the table. Nobody can tell.
   */
  function reseed() {
    const s = C.S;
    if (s.started || s.over || s.towers.length || s.cheated) return;
    const seed = scores.takeSeed(st.level, st.diff);
    if (seed === undefined) return;
    C.newGame(st.diff, st.level, seed);
    clearPicks(st);
  }

  /**
   * Runs `next` (a new game, the menu, another map), after asking "save to the records table?" when a finished game that
   * could be entered is being left.
   */
  function leave(next: () => void) {
    if (C.S.over && scores.ask(next)) return;
    next();
  }

  function renderOver() {
    const s = C.S;
    if (!s.over) return;
    $("overTtl").textContent = s.won ? t("won") : t("lost");
    $("overTxt").innerHTML = s.won
      ? t("wonTxt", { d: ui.where(), s: s.score, l: s.lives, f: C.FINAL })
      : t("lostTxt", { w: s.wave, s: s.score, d: ui.where(), b: st.best, f: C.FINAL });
  }

  function openMenu() {
    const s = C.S,
      inGame = s.started && !s.over;
    $("mPlay").textContent = inGame ? t("contWave", { w: s.wave }) : t("play");
    $("mNew").hidden = !inGame;
    $("mLevel").innerHTML = mapThumb(C.LEVELS[st.level]) + `<span>${t("levelIs", { l: L(C.LEVELS[st.level]) })}</span>`;
    $("mDiff").innerHTML = skullIcon(st.diff, 24) + `<span>${t("diffIs", { d: L(C.DIFF[st.diff]) })}</span>`;
    const b = Math.max(st.best, 0);
    $("mBest").textContent = b ? t("menuBest", { d: ui.where(), b, f: C.FINAL }) : "";
    screens.hide("pause");
    screens.hide("over");
    screens.show("menu");
  }

  // what the game tells the interface
  C.on((e) => {
    if (e.type === "toast") ui.toast(t(e.key, e.vars));
    else if (e.type === "wave") $("banner").hidden = true;
    else if (e.type === "end") {
      if (C.S.wave > st.best && !C.S.cheated) {
        st.best = C.S.wave;
        progress.saveBest(st.level, st.diff, st.best);
      }
      if (e.won && !C.S.cheated) progress.saveWon(st.level, st.diff);
      $("over").classList.toggle("won", e.won);
      renderOver();
      screens.show("over");
      scores.onEnd();
    } else if (e.type === "sold" && st.sel === e.tower) st.sel = null;
    else if (e.type === "cheat") {
      if (e.code === "bagowpw") progress.openAllMaps();
      if (e.code === "crazytown") ui.renderer.setPhrases(grumbles(t));
      ui.toast(e.code === "hesoyam" ? t("cheatOk", { l: C.S.lives }) : t(CHEAT_TEXT[e.code] ?? "cheatOk"));
      ui.sound.play("ult");
      ui.refresh();
    }
  });

  return { newGame, renderOver, openMenu, reseed, leave };
}

export type Session = ReturnType<typeof createSession>;
