// The settings and help screens: language, difficulty (with the confirmation when a game is under way).
import type { DiffKey } from "../game/types";
import type { UiContext } from "./context";
import { diffColor, skullIcon } from "./difficulty";
import type { Progress } from "./progress";
import type { Session } from "./session";

export interface SettingsDeps {
  /** redraws everything that has texts, after the language changed */
  applyLang(): void;
  /** the parts of the settings screen that depend on the browser and the sound: redrawn when it opens */
  redrawOnOpen(): void;
}

export function installSettings(ui: UiContext, progress: Progress, session: Session, deps: SettingsDeps) {
  const { core: C, state: st, i18n: I, t, L, $, screens } = ui;
  let pendingDiff: DiffKey | null = null;

  // the language selector lists every language by its own name, so it is readable whatever language is on
  function renderLangs() {
    $("langSel").innerHTML = I.LANGUAGES.map(
      (l) => `<option value="${l.code}" lang="${l.html}"${l.code === I.lang ? " selected" : ""}>${l.name}</option>`,
    ).join("");
  }

  function renderDiffs() {
    $("diffs").innerHTML = C.DKEYS.map((k) => {
      const d = C.DIFF[k],
        b = progress.bestOf(k);
      return `<button class="dcard${k === st.diff ? " on" : ""}" data-d="${k}"><span class="ic">${skullIcon(k)}</span><b style="color:${diffColor(k)}">${L(d)}</b><small>${L(d, "desc")}${b ? t("bestShort", { b }) : ""}</small></button>`;
    }).join("");
  }

  function applyDiff(k: DiffKey) {
    st.diff = k;
    progress.saveDiff(k);
    session.newGame();
    screens.hide("settings");
    if (screens.isOpen("menu")) session.openMenu();
    ui.refresh();
    ui.toast(t("diffIs", { d: L(C.DIFF[st.diff]) }));
  }

  function openSettings() {
    deps.redrawOnOpen();
    renderLangs();
    renderDiffs();
    $("confirm").hidden = true;
    screens.show("settings");
  }

  function openHelp() {
    $("bestLine").innerHTML = t("bestLine", { d: L(C.DIFF[st.diff]), b: Math.max(st.best, C.S.wave), f: C.FINAL });
    screens.show("help");
  }

  $("langSel").addEventListener("change", (e) => {
    if (!I.setLang((e.target as HTMLSelectElement).value)) return;
    deps.applyLang();
    renderLangs();
    renderDiffs();
  });
  $("setClose").addEventListener("click", () => screens.hide("settings"));
  $("helpClose").addEventListener("click", () => screens.hide("help"));
  for (const id of ["help", "settings"] as const)
    $(id).addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === id) screens.hide(id);
    });

  $("diffs").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-d]");
    if (!b) return;
    const k = b.dataset.d as DiffKey,
      s = C.S;
    if (s.started && !s.over && s.wave > 0) {
      pendingDiff = k;
      $("confirmTxt").textContent = t("confirm", { w: s.wave, d: L(C.DIFF[k]) });
      $("confirm").hidden = false;
    } else applyDiff(k);
  });
  $("confirmYes").addEventListener("click", () => {
    if (pendingDiff) applyDiff(pendingDiff);
    pendingDiff = null;
  });
  $("confirmNo").addEventListener("click", () => {
    $("confirm").hidden = true;
    pendingDiff = null;
  });

  return { openSettings, openHelp, renderDiffs };
}

export type Settings = ReturnType<typeof installSettings>;
