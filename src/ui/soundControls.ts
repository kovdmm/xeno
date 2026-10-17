// The sound controls in the settings: the on/off toggle and the two volume sliders.
import type { UiContext } from "./context";

export function installSoundControls(ui: UiContext) {
  const { $, t, sound: A } = ui;

  function draw() {
    const on = A.ok && !A.muted;
    const toggle = $<HTMLButtonElement>("sndToggle");
    toggle.textContent = A.ok ? (on ? t("soundOn") : t("soundOff")) : t("noAudio");
    toggle.classList.toggle("on", on);
    toggle.disabled = !A.ok;
    const vol = $<HTMLInputElement>("sndVol"),
      mus = $<HTMLInputElement>("musVol");
    vol.value = String(Math.round(A.volume * 100));
    vol.disabled = !A.ok;
    mus.value = String(Math.round(A.musicVolume * 100));
    mus.disabled = !A.ok;
  }

  function toggleSound() {
    if (!A.ok) {
      ui.toast(t("noAudio"));
      return;
    }
    A.setMuted(!A.muted);
    draw();
    ui.toast(A.muted ? t("soundOff") : t("soundOn"));
  }

  $("sndToggle").addEventListener("click", toggleSound);
  // moving a slider up from silence switches the sound back on
  $("sndVol").addEventListener("input", (e) => {
    const v = +(e.target as HTMLInputElement).value;
    A.setVolume(v / 100);
    if (A.muted && v > 0) A.setMuted(false);
    draw();
  });
  $("musVol").addEventListener("input", (e) => {
    const v = +(e.target as HTMLInputElement).value;
    A.setMusicVolume(v / 100);
    if (A.muted && v > 0) A.setMuted(false);
    draw();
  });

  return { draw, toggleSound };
}
