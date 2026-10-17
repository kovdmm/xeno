// The settings and help screens: language, difficulty (with the confirmation when a game is under way).
import type { DiffKey } from "../game/types";
import type { UiContext } from "./context";
import { diffColor, skullIcon } from "./difficulty";
import { mapThumb } from "./mapThumb";
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
  // a change of difficulty or map waiting for the player to confirm that the game under way is dropped
  let pending: { diff?: DiffKey; level?: string } | null = null;

  // the language selector lists every language by its own name, so it is readable whatever language is on
  function renderLangs() {
    $("langSel").innerHTML = I.LANGUAGES.map(
      (l) => `<option value="${l.code}" lang="${l.html}"${l.code === I.lang ? " selected" : ""}>${l.name}</option>`,
    ).join("");
  }

  function renderDiffs() {
    $("diffs").innerHTML = C.DKEYS.map((k) => {
      const d = C.DIFF[k],
        b = progress.bestOf(st.level, k);
      return `<button class="dcard${k === st.diff ? " on" : ""}" data-d="${k}"><span class="ic">${skullIcon(k)}</span><b style="color:${diffColor(k)}">${L(d)}</b><small>${L(d, "desc")}${b ? t("bestShort", { b }) : ""}</small></button>`;
    }).join("");
  }

  function renderLevels() {
    $("levels").innerHTML = C.LKEYS.map((id) => {
      const d = C.LEVELS[id],
        b = progress.bestOf(id, st.diff);
      return `<button class="dcard${id === st.level ? " on" : ""}" data-l="${id}"><span class="ic">${mapThumb(d)}</span><b>${L(d)}</b><small>${L(d, "desc")} ${t("wavesN", { n: d.finalWave })}.${b ? t("bestShort", { b }) : ""}</small></button>`;
    }).join("");
  }

  /** Switches to another difficulty and/or map and starts a new game on it. */
  function applyChoice(c: { diff?: DiffKey; level?: string }) {
    if (c.diff) {
      st.diff = c.diff;
      progress.saveDiff(c.diff);
    }
    if (c.level) {
      st.level = c.level;
      progress.saveLevel(c.level);
    }
    session.newGame();
    screens.hide("settings");
    if (screens.isOpen("menu")) session.openMenu();
    ui.refresh();
    ui.toast(c.level ? t("levelIs", { l: L(C.LEVELS[st.level]) }) : t("diffIs", { d: L(C.DIFF[st.diff]) }));
  }

  /** Applies a choice at once, or asks first when a game is under way. */
  function choose(c: { diff?: DiffKey; level?: string }) {
    const s = C.S;
    if (s.started && !s.over && s.wave > 0) {
      pending = c;
      $("confirmTxt").textContent = t("confirm", { w: s.wave, d: ui.where(c.level ?? st.level, c.diff ?? st.diff) });
      $("confirm").hidden = false;
    } else applyChoice(c);
  }

  function openSettings() {
    deps.redrawOnOpen();
    renderLangs();
    renderLevels();
    renderDiffs();
    $("confirm").hidden = true;
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
    renderLevels();
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
    if (b) choose({ diff: b.dataset.d as DiffKey });
  });
  $("levels").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-l]");
    if (b) choose({ level: b.dataset.l });
  });
  $("confirmYes").addEventListener("click", () => {
    if (pending) applyChoice(pending);
    pending = null;
  });
  $("confirmNo").addEventListener("click", () => {
    $("confirm").hidden = true;
    pending = null;
  });

  return { openSettings, openHelp, renderDiffs, renderLevels };
}

export type Settings = ReturnType<typeof installSettings>;
