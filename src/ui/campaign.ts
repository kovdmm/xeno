// The campaign screen: the maps and difficulties as one grid, with the best waves, the stars and the locks. Choosing
// a cell starts a new game on it (after a question, when a game is under way). It has its own screen: the settings
// hold only settings.
import type { DiffKey } from "../game/types";
import type { UiContext } from "./context";
import { diffColor, skullIcon } from "./difficulty";
import { mapThumb } from "./mapThumb";
import type { Progress } from "./progress";
import type { Session } from "./session";

const LOCK =
  '<svg class="lockIc" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>';
const WIN =
  '<svg class="winIc" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.7 1.3 6.7-6-3.4-6 3.4 1.3-6.7-5-4.7 6.8-.8z"/></svg>';

export function installCampaign(ui: UiContext, progress: Progress, session: Session) {
  const { core: C, state: st, t, L, $, screens } = ui;
  // a change of difficulty or map waiting for the player to confirm that the game under way is dropped
  let pending: { diff?: DiffKey; level?: string } | null = null;

  /**
   * The campaign as one grid: the maps are the rows, the difficulties the columns. A cell shows the best wave and, after
   * a victory, a star; a cell that is not open yet shows a lock and the rule that opens it, in words. The cell being
   * played is marked.
   */
  function render() {
    const head = C.DKEYS.map(
      (k) =>
        `<b class="cDiff" style="color:${diffColor(k)}"><span class="sk">${skullIcon(k, 22)}</span><span>${L(C.DIFF[k])}</span></b>`,
    ).join("");
    const rows = C.LKEYS.map((id) => {
      const d = C.LEVELS[id],
        map = L(d);
      const cells = C.DKEYS.map((k) => {
        const diff = L(C.DIFF[k]),
          lock = progress.lockOf(id, k),
          at = `data-l="${id}" data-d="${k}"`;
        if (lock) {
          const rule =
            lock.kind === "map"
              ? t("lockMap", { n: lock.need, d: L(C.DIFF[C.DKEYS[0]]), m: L(C.LEVELS[lock.from]) })
              : t("lockDiff", { n: lock.need, d: L(C.DIFF[lock.from as DiffKey]) });
          const label = t("cellLocked", { m: map, d: diff, r: rule });
          return `<button class="cc lock" ${at} disabled aria-label="${label}">${LOCK}<small>${rule}</small></button>`;
        }
        const best = progress.bestOf(id, k),
          won = progress.wonOf(id, k),
          on = id === st.level && k === st.diff;
        const label = t("cellOpen", { m: map, d: diff, b: best, f: d.finalWave }) + (won ? ". " + t("cellWon") : "");
        return `<button class="cc${on ? " on" : ""}${won ? " won" : ""}" ${at} aria-label="${label}"${on ? ' aria-current="true"' : ""}><b>${best || "–"}</b><small>/${d.finalWave}</small>${won ? `<span class="cWin" title="${t("cellWon")}">${WIN}</span>` : ""}</button>`;
      }).join("");
      return `<div class="cRow"><div class="cMap">${mapThumb(d)}<b>${map}</b><small>${t("wavesN", { n: d.finalWave })}</small></div>${cells}</div>`;
    }).join("");
    $("campaign").innerHTML = `<div class="cHead"><span></span>${head}</div>${rows}`;
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
    screens.hide("campaignPage");
    if (screens.isOpen("menu")) session.openMenu();
    ui.refresh();
    ui.toast(ui.where());
  }

  /** Applies a choice at once, or asks first when a game is under way. */
  function choose(c: { diff?: DiffKey; level?: string }) {
    const s = C.S;
    if (s.started && !s.over && s.wave > 0) {
      pending = c;
      $("confirmTxt").textContent = t("confirm", { w: s.wave, d: ui.where(c.level ?? st.level, c.diff ?? st.diff) });
      $("confirm").hidden = false;
    } else session.leave(() => applyChoice(c));
  }

  function open() {
    render();
    $("confirm").hidden = true;
    pending = null;
    screens.show("campaignPage");
  }

  $("campClose").addEventListener("click", () => screens.hide("campaignPage"));
  $("campaignPage").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "campaignPage") screens.hide("campaignPage");
  });
  $("campaign").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-l][data-d]");
    if (b && !b.disabled) choose({ level: b.dataset.l, diff: b.dataset.d as DiffKey });
  });
  $("confirmYes").addEventListener("click", () => {
    const c = pending;
    pending = null;
    if (c) session.leave(() => applyChoice(c));
  });
  $("confirmNo").addEventListener("click", () => {
    $("confirm").hidden = true;
    pending = null;
  });
  // the map and the difficulty of the title and of the end screen lead here
  $("mLevel").addEventListener("click", open);
  $("mDiff").addEventListener("click", open);
  $("pCampaign").addEventListener("click", open);
  $("overDiff").addEventListener("click", open);

  return { open, render };
}

export type Campaign = ReturnType<typeof installCampaign>;
