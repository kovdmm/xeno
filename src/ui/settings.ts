// The settings and help screens. The settings are the language, the screen, the install button and the sound; the
// maps and difficulties are on their own screen (campaign.ts).
import type { UiContext } from "./context";

export interface SettingsDeps {
  /** redraws everything that has texts, after the language changed */
  applyLang(): void;
  /** the parts of the settings screen that depend on the browser and the sound: redrawn when it opens */
  redrawOnOpen(): void;
}

export function installSettings(ui: UiContext, deps: SettingsDeps) {
  const { core: C, state: st, i18n: I, t, L, $, screens } = ui;

  // the language selector lists every language by its own name, so it is readable whatever language is on
  function renderLangs() {
    $("langSel").innerHTML = I.LANGUAGES.map(
      (l) => `<option value="${l.code}" lang="${l.html}"${l.code === I.lang ? " selected" : ""}>${l.name}</option>`,
    ).join("");
  }

  function openSettings() {
    deps.redrawOnOpen();
    renderLangs();
    screens.show("settings");
  }

  function openHelp() {
    $("bestLine").innerHTML = t("bestLine", {
      m: L(C.LEVELS[st.level]),
      d: L(C.DIFF[st.diff]),
      b: Math.max(st.best, C.S.wave),
      f: C.FINAL,
    });
    screens.show("help");
  }

  $("langSel").addEventListener("change", (e) => {
    if (!I.setLang((e.target as HTMLSelectElement).value)) return;
    deps.applyLang();
    renderLangs();
  });
  $("setClose").addEventListener("click", () => screens.hide("settings"));
  $("helpClose").addEventListener("click", () => screens.hide("help"));
  for (const id of ["help", "settings"] as const)
    $(id).addEventListener("click", (e) => {
      if ((e.target as HTMLElement).id === id) screens.hide(id);
    });

  return { openSettings, openHelp };
}

export type Settings = ReturnType<typeof installSettings>;
