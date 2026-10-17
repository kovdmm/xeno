// Fullscreen and installing as an app: the two ways the game gets more of the screen.
import { createInstaller } from "../pwa";
import type { UiContext } from "./context";

/** Running as an installed app: it already has the whole screen. */
export const isInstalledApp = (): boolean =>
  matchMedia("(display-mode: standalone), (display-mode: fullscreen)").matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

type FsDoc = Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> };
type FsRoot = HTMLElement & { webkitRequestFullscreen?: (o?: FullscreenOptions) => Promise<void> };

export function installAppMode(ui: UiContext, onFullscreenChange: () => void) {
  const { $, t } = ui;
  const asApp = isInstalledApp();
  const root = document.documentElement as FsRoot;
  const doc = document as FsDoc;
  const fsEl = () => document.fullscreenElement || doc.webkitFullscreenElement;
  // an installed app has no use for the fullscreen question or button; the browser may not offer it either
  // (iPhone Safari), and then the button is shown disabled, with an explanation
  const fsOK =
    !asApp &&
    !!(
      document.fullscreenEnabled ||
      (document as unknown as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled
    ) &&
    !!(root.requestFullscreen || root.webkitRequestFullscreen);

  function drawFs() {
    const b = $<HTMLButtonElement>("fsBtn"),
      on = fsOK && !!fsEl();
    const row = b.parentElement!;
    row.hidden = (row.previousElementSibling as HTMLElement).hidden = asApp;
    b.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;vertical-align:-3px;margin-right:6px">' +
      (on
        ? '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'
        : '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>') +
      "</svg>" +
      (fsOK ? (on ? t("fsOff") : t("fsOn")) : t("fsNo"));
    b.disabled = !fsOK;
    b.classList.toggle("on", on);
  }

  async function toggleFs() {
    try {
      if (fsEl()) await (document.exitFullscreen || doc.webkitExitFullscreen)!.call(document);
      else {
        await (root.requestFullscreen || root.webkitRequestFullscreen)!.call(root, { navigationUI: "hide" });
        // on phones, keep the orientation the player is holding
        try {
          await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.(
            screen.orientation.type,
          );
        } catch {
          /* not allowed: fine */
        }
      }
    } catch {
      ui.toast(t("fsFail"));
    }
  }

  $("fsBtn").addEventListener("click", toggleFs);
  // phones and tablets: offer fullscreen on every visit (the tap itself is the gesture the browser needs)
  $("fsYes").addEventListener("click", () => {
    ui.screens.hide("fsAsk");
    if (!fsEl()) toggleFs();
  });
  $("fsNo").addEventListener("click", () => ui.screens.hide("fsAsk"));
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"])
    document.addEventListener(ev, () => {
      drawFs();
      onFullscreenChange();
    });

  /** Offers fullscreen to a phone or tablet player at the start. */
  function askFullscreen() {
    if (fsOK && !fsEl() && matchMedia("(pointer:coarse)").matches && !ui.isDesk()) ui.screens.show("fsAsk");
  }

  const installer = createInstaller(
    { standalone: asApp, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints || 0 },
    window,
    () => drawInstall(),
  );
  function drawInstall() {
    const st = installer.state(),
      b = $<HTMLButtonElement>("installBtn"),
      note = $("installNote");
    b.textContent = st === "installed" ? t("installDone") : st === "unavailable" ? t("installNo") : t("installBtn");
    b.disabled = st === "installed" || st === "unavailable";
    note.hidden = st !== "ios";
    note.textContent = st === "ios" ? t("installIos") : "";
  }
  $("installBtn").addEventListener("click", () => {
    if (installer.state() === "ios") ui.toast(t("installIos"));
    else installer.prompt();
  });

  return { drawFs, drawInstall, askFullscreen, asApp };
}
