// The tray of tower buttons and ability buttons. Built again when the language or the board orientation
// changes, because the tooltips and names depend on both.
import type { AbilityKey, TowerType } from "../game/types";
import type { UiContext } from "./context";
import { ABILITY_ICONS } from "./icons";

export interface PaletteHandlers {
  build(n: TowerType): void;
  ability(k: AbilityKey): void;
}

export function createPalette(ui: UiContext, on: PaletteHandlers) {
  const { core: C, L, $ } = ui;
  const towers = $("towers"),
    abilities = $("abil");

  function build() {
    towers.innerHTML = "";
    abilities.innerHTML = "";
    for (const n of C.TKEYS) {
      const d = C.TT[n],
        b = document.createElement("button");
      b.className = "tb";
      b.dataset.t = n;
      b.innerHTML = `<canvas width="80" height="80"></canvas><span class="nm">${L(d)}</span><span class="meta"><span class="ky">${d.key}</span><span class="cs">${d.cost[0]}</span></span>`;
      b.title = `${L(d)} (${d.key})${d.size ? ", 2×2" : ""}: ${L(d, "desc")}`;
      b.setAttribute("aria-label", L(d));
      b.addEventListener("click", () => on.build(n));
      towers.appendChild(b);
      const c = b.querySelector("canvas")!.getContext("2d")!;
      c.setTransform(80, 0, 0, 80, 0, 0);
      ui.renderer.towerIcon(c, n);
    }
    for (const k of C.AKEYS) {
      const a = C.AB[k],
        b = document.createElement("button");
      b.className = "ab";
      b.dataset.a = k;
      b.title = `${L(a)} (${a.key.toUpperCase()}): ${L(a, "desc")}`;
      b.setAttribute("aria-label", L(a));
      b.innerHTML = `<span class="aico">${ABILITY_ICONS[k]}</span><b class="sn">${L(a)}</b><span class="meta"><span class="c"></span><span class="ky">${a.key.toUpperCase()}</span></span><div class="cdbar"></div>`;
      b.addEventListener("click", () => on.ability(k));
      abilities.appendChild(b);
    }
    fitNames();
  }

  // Long words ("Maschinengewehr", "Flächenbombardement") must not be cut off in the narrow palette: shrink
  // the font of a name that does not fit, down to a readable minimum.
  function fitNames() {
    for (const el of document.querySelectorAll<HTMLElement>(".tb .nm, .ab .sn")) {
      el.style.fontSize = "";
      if (!el.offsetParent) continue; // not shown in this layout
      let px = parseFloat(getComputedStyle(el).fontSize);
      while (el.scrollWidth > el.clientWidth + 1 && px > 9) el.style.fontSize = (px -= 0.5) + "px";
    }
  }
  document.fonts?.ready.then(fitNames); // the real font is wider or narrower than the fallback

  return {
    build,
    fitNames,
    towerButtons: () => towers.querySelectorAll<HTMLElement>(".tb"),
    abilityButtons: () => abilities.querySelectorAll<HTMLButtonElement>(".ab"),
  };
}

export type Palette = ReturnType<typeof createPalette>;
