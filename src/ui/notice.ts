// The one-time notice after a release reset what the browser had kept (src/saveMigration.ts): shown over the title
// until the player has read it, and never again.
import { NOTICE_KEY } from "../saveMigration";
import type { UiContext } from "./context";

export function installResetNotice(ui: UiContext) {
  const { store, t, $ } = ui;
  $("noticeOk").addEventListener("click", () => {
    store.set(NOTICE_KEY, "");
    $("resetNotice").hidden = true;
  });
  return {
    /** Shows the notice when the migration left one, with the text of what it did. */
    showIfDue() {
      const kind = store.get(NOTICE_KEY);
      if (kind !== "all" && kind !== "progress") return;
      $("noticeTxt").textContent = t(kind === "all" ? "noticeAll" : "noticeProgress");
      $("resetNotice").hidden = false;
      $("noticeOk").focus();
    },
  };
}
