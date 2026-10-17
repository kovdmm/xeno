// The credits that roll over the win screen, and the easter egg that starts them: ten quick clicks on a logo.
import type { UiContext } from "./context";

export function installCredits(ui: UiContext) {
  const { $ } = ui;

  function open() {
    const c = $("croll");
    c.innerHTML = (ui.i18n.t("credits") as [string, string][])
      .map(([r, n], i) =>
        r ? `<div class="cr"><i>${r}</i><b>${n}</b></div>` : `<div class="cr ${i ? "end" : "top"}"><b>${n}</b></div>`,
      )
      .join("");
    c.style.animation = "none";
    void c.offsetWidth; // restart the animation
    c.style.animation = "";
    ui.screens.show("credits");
    ui.sound.play("wave");
  }
  function close() {
    if (ui.screens.isOpen("credits")) ui.screens.hide("credits");
  }

  let clicks = 0,
    last = 0;
  function logoClick() {
    const now = performance.now();
    clicks = now - last < 1500 ? clicks + 1 : 1;
    last = now;
    if (clicks >= 10) {
      clicks = 0;
      open();
    }
  }
  document.querySelectorAll(".dlogo,.menu .logo").forEach((el) => el.addEventListener("click", logoClick));
  $("credits").addEventListener("click", close);
  $("croll").addEventListener("animationend", close);

  return { open, close };
}
