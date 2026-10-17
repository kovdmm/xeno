// The running session: starting a game, what the game's events do to the interface, the title screen,
// the pause and the end screens.
import { skullIcon } from "./difficulty";
import type { UiContext } from "./context";
import type { Progress } from "./progress";
import { clearPicks } from "./state";

export function createSession(ui: UiContext, progress: Progress, openCredits: () => void) {
  const { core: C, state: st, t, L, $, screens } = ui;

  // the credits roll 1.8 s after a victory; starting another game in that time must cancel them
  let creditsTimer: ReturnType<typeof setTimeout> | undefined;

  function newGame() {
    clearTimeout(creditsTimer);
    st.best = progress.bestOf(st.diff);
    C.newGame(st.diff);
    clearPicks(st);
    $("banner").hidden = false;
    $("banner").textContent = t("banner", { d: L(C.DIFF[st.diff]) });
    screens.hide("over");
  }

  function renderOver() {
    const s = C.S;
    if (!s.over) return;
    $("overTtl").textContent = s.won ? t("won") : t("lost");
    $("overTxt").innerHTML = s.won
      ? t("wonTxt", { d: L(C.DIFF[st.diff]), s: s.score, l: s.lives })
      : t("lostTxt", { w: s.wave, s: s.score, d: L(C.DIFF[st.diff]), b: st.best });
  }

  function openMenu() {
    const s = C.S,
      inGame = s.started && !s.over;
    $("mPlay").textContent = inGame ? t("contWave", { w: s.wave }) : t("play");
    $("mNew").hidden = !inGame;
    $("mDiff").innerHTML = skullIcon(st.diff, "bigsk") + `<span>${t("diffIs", { d: L(C.DIFF[st.diff]) })}</span>`;
    const b = Math.max(st.best, 0);
    $("mBest").textContent = b ? t("menuBest", { d: L(C.DIFF[st.diff]), b, f: C.FINAL }) : "";
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
        progress.saveBest(st.diff, st.best);
      }
      $("over").classList.toggle("won", e.won);
      renderOver();
      screens.show("over");
      if (e.won) creditsTimer = setTimeout(() => C.S.won && C.S.over && openCredits(), 1800); // over the win screen
    } else if (e.type === "sold" && st.sel === e.tower) st.sel = null;
    else if (e.type === "cheat") {
      ui.toast(t("cheatOk", { l: C.S.lives }));
      ui.sound.play("ult");
      ui.refresh();
    }
  });

  return { newGame, renderOver, openMenu };
}

export type Session = ReturnType<typeof createSession>;
