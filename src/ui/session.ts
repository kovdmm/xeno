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
  openCredits: () => void,
  /** the length of the game changed with the level: texts that state it must be written again */
  onLengthChange: () => void,
) {
  const { core: C, state: st, t, L, $, screens } = ui;

  // the credits roll 1.8 s after a victory; starting another game in that time must cancel them
  let creditsTimer: ReturnType<typeof setTimeout> | undefined;
  let length = C.FINAL;

  function newGame() {
    clearTimeout(creditsTimer);
    st.best = progress.bestOf(st.level, st.diff);
    C.newGame(st.diff, st.level);
    clearPicks(st);
    $("banner").hidden = false;
    $("banner").textContent = t("banner", { d: L(C.DIFF[st.diff]), f: C.FINAL });
    screens.hide("over");
    if (C.FINAL !== length) {
      length = C.FINAL;
      onLengthChange();
    }
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
    $("mDiff").innerHTML = skullIcon(st.diff, "bigsk") + `<span>${t("diffIs", { d: L(C.DIFF[st.diff]) })}</span>`;
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
      if (e.won) creditsTimer = setTimeout(() => C.S.won && C.S.over && openCredits(), 1800); // over the win screen
    } else if (e.type === "sold" && st.sel === e.tower) st.sel = null;
    else if (e.type === "cheat") {
      if (e.code === "bagowpw") progress.openAllMaps();
      if (e.code === "crazytown") ui.renderer.setPhrases(grumbles(t));
      ui.toast(e.code === "hesoyam" ? t("cheatOk", { l: C.S.lives }) : t(CHEAT_TEXT[e.code] ?? "cheatOk"));
      ui.sound.play("ult");
      ui.refresh();
    }
  });

  return { newGame, renderOver, openMenu };
}

export type Session = ReturnType<typeof createSession>;
