// Applying a language to the page: static texts (marked with data-i), labels, and everything built from texts.
import type { UiContext } from "./context";

export interface LanguageDeps {
  /** parts that draw texts of their own */
  redraw: Array<() => void>;
  rebuildPalette(): void;
  renderOver(): void;
  openMenu(): void;
}

export function createApplyLang(ui: UiContext, d: LanguageDeps) {
  const { core: C, state: st, i18n: I, t, L, $ } = ui;
  return function applyLang() {
    document.documentElement.lang = I.htmlLang;
    document.title = t("title");
    document.querySelectorAll<HTMLElement>("[data-i]").forEach((e) => {
      e.innerHTML = t(e.dataset.i!);
    });
    document.querySelectorAll<HTMLElement>("[data-i-label]").forEach((e) => {
      const v = t(e.dataset.iLabel!);
      e.setAttribute("aria-label", v);
      e.title = v;
    });
    $("field").setAttribute("aria-label", t("field"));
    d.rebuildPalette();
    for (const f of d.redraw) f();
    d.renderOver();
    if (!C.S.started) $("banner").textContent = t("banner", { d: L(C.DIFF[st.diff]) });
    if (ui.screens.isOpen("menu")) d.openMenu();
    ui.invalidate();
    ui.refresh();
  };
}
