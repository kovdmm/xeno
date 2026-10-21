// Fullscreen and installing as an app: the two ways the game gets more of the screen.
import { createInstaller, createWakeLock, shouldOfferInstall } from "../pwa";
import { speedOf } from "./state";
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
    offerInstall();
  });
  $("fsNo").addEventListener("click", () => {
    ui.screens.hide("fsAsk");
    offerInstall();
  });
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"])
    document.addEventListener(ev, () => {
      drawFs();
      onFullscreenChange();
    });

  /** Offers fullscreen to a phone or tablet player at the start. */
  function askFullscreen() {
    if (fsOK && !fsEl() && isPhone()) ui.screens.show("fsAsk");
    else offerInstall();
  }
  const isPhone = () => matchMedia("(pointer:coarse)").matches && !ui.isDesk();

  const installer = createInstaller(
    { standalone: asApp, userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints || 0 },
    window,
    () => drawInstall(),
    (window as unknown as { __xtInstall?: Event }).__xtInstall ?? null,
  );
  function drawInstall() {
    const st = installer.state(),
      b = $<HTMLButtonElement>("installBtn"),
      note = $("installNote");
    b.textContent = st === "installed" ? t("installDone") : t("installBtn");
    b.disabled = st === "installed" || st === "unavailable";
    // no dialog to show: iPhone has its own way, elsewhere the browser menu may still offer installing
    note.hidden = st !== "ios" && st !== "unavailable";
    note.textContent = st === "ios" ? t("installIos") : st === "unavailable" ? t("installMenu") : "";
    offerInstall(); // the browser's offer may arrive late
  }

  // suggest installing once: a sheet over the menu on a phone, never again after "Not now" or an answer
  const DISMISSED = "xt-install-dismissed";
  const ask = $("installAsk");
  let offered = false;
  function offerInstall() {
    const st = installer.state();
    const quiet = ["fsAsk", "settings", "help", "pause", "over"].every(
      (s) => !ui.screens.isOpen(s as never),
    );
    if (offered || !quiet || !ui.screens.isOpen("menu")) return;
    if (!shouldOfferInstall(st, ui.store.get(DISMISSED) === "1", isPhone())) return;
    offered = true;
    const ios = st === "ios"; // no dialog to call: the sheet explains the Share menu and has one button
    const yes = $("installYes");
    yes.dataset.i = ios ? "installOk" : "installBtn";
    yes.textContent = t(yes.dataset.i);
    $("installAskTxt").dataset.i = ios ? "installIos" : "installAskTxt";
    $("installAskTxt").textContent = t(ios ? "installIos" : "installAskTxt");
    ask.hidden = false;
  }
  function closeAsk() {
    ask.hidden = true;
    ui.store.set(DISMISSED, "1");
  }
  $("installYes").addEventListener("click", () => {
    const ios = installer.state() === "ios";
    closeAsk();
    if (!ios) void installer.prompt();
  });
  $("installNo").addEventListener("click", closeAsk);
  $("installBtn").addEventListener("click", () => {
    if (installer.state() === "ios") ui.toast(t("installIos"));
    else installer.prompt();
  });

  // the screen stays awake while a game runs: not on the pause, a menu or the end screen, not in a hidden tab
  const wake = createWakeLock(navigator, () => !document.hidden);
  const syncWake = () => void wake.sync(!ui.core.S.over && speedOf(ui.state) > 0);
  setInterval(syncWake, 1000);
  document.addEventListener("visibilitychange", syncWake);

  return { drawFs, drawInstall, askFullscreen, asApp, wake };
}
