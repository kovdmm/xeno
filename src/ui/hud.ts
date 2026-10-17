// The HUD and the panels: numbers, the line about the next wave, the palette state, the tower card.
// `refresh` is called often (every 0.1 s and after every action), so it only touches the DOM when something changed.
import type { UiContext } from "./context";
import { idleCard, nextLine, towerCard } from "./cards";
import { fmt } from "./format";
import type { Palette } from "./palette";
import { SPEEDS, speedOf } from "./state";

export function createHud(ui: UiContext, palette: Palette) {
  const { core: C, state: st, t, $ } = ui;
  const dock = $("dock"),
    waveEl = dock.querySelector<HTMLElement>(".wave")!,
    ctrlEl = dock.querySelector<HTMLElement>(".ctrl")!;
  let lastInfo = "",
    lastNext = "";

  const invalidate = () => {
    lastInfo = "\u0000";
    lastNext = "";
  };

  function drawSpeed() {
    const b = $("speedBtn");
    b.textContent = st.paused ? "❚❚" : "×" + SPEEDS[st.speedIdx];
    b.classList.toggle("paused", st.paused);
  }

  function refresh() {
    const s = C.S;
    if (st.sel && !s.towers.includes(st.sel)) st.sel = null;
    $("sCred").textContent = String(fmt(Math.floor(s.credits)));
    $("sLives").textContent = String(s.lives);
    $("sWave").textContent = s.wave + "/" + C.FINAL;
    $("sScore").textContent = String(fmt(s.score));
    $("progBar").style.width = (s.wave / C.FINAL) * 100 + "%";

    const nx = nextLine(ui.cards, st);
    if (nx !== lastNext) {
      $("next").innerHTML = nx;
      lastNext = nx;
    }
    const g = $<HTMLButtonElement>("go");
    g.textContent = !s.started
      ? t("start")
      : s.wave >= C.FINAL
        ? t("noMore")
        : `${t("call")} +${Math.max(0, Math.floor(s.timer))}`;
    g.disabled = s.over || s.wave >= C.FINAL;

    palette.towerButtons().forEach((b) => {
      const n = b.dataset.t as keyof typeof C.TT;
      b.classList.toggle("on", st.build === n);
      b.classList.toggle("poor", s.credits < C.TT[n].cost[0]);
    });
    palette.abilityButtons().forEach((b) => {
      const k = b.dataset.a as keyof typeof C.AB,
        c = C.abCost(k),
        cd = s.cd[k];
      b.querySelector(".c")!.textContent = cd > 0 ? Math.ceil(cd) + " " + t("s") : String(fmt(c));
      b.querySelector<HTMLElement>(".cdbar")!.style.width = (cd / C.AB[k].cd) * 100 + "%";
      b.classList.toggle("on", st.aim === k);
      b.classList.toggle("poor", s.credits < c);
      b.disabled = s.over;
    });

    // The selected-tower card takes the palette's place so the tray never grows past the screen.
    let h: string;
    if (ui.isDesk()) {
      $("pal").hidden = false;
      $("info").hidden = false;
      waveEl.hidden = ctrlEl.hidden = false;
      h = st.sel ? towerCard(ui.cards, st.sel) : idleCard(ui.cards, st);
    } else {
      // phones: the tower card takes the whole tray (wave line, buttons and palette) so it never needs scrolling
      const card = !!st.sel;
      $("pal").hidden = waveEl.hidden = ctrlEl.hidden = card;
      $("info").hidden = !card;
      h = st.sel ? towerCard(ui.cards, st.sel) : "";
    }
    if (h !== lastInfo) {
      $("info").innerHTML = h;
      lastInfo = h;
      $("info").classList.toggle("ultmode", !!st.sel && st.sel.lvl === 3);
    }
  }

  return { refresh, invalidate, drawSpeed, speed: () => speedOf(st) };
}

export type Hud = ReturnType<typeof createHud>;
