// The coach: the tutorial's steps and the tips of the game, drawn over the field. The rules (which step, which tip) are
// the engine's (src/tutorial/engine.ts); this module feeds it what happens in the game, draws what it answers (a text
// box, rings and an arrow on the marked thing, a dim for "press this" steps) and keeps the flags in the store:
//   xt-tutorial   "done" | "skipped" when the steps were finished or skipped (absent: the first game runs them)
//   xt-hints      how many times each tip was shown
//   xt-tips-off   "1": the tips are switched off in the settings
// It only watches the game; it never changes it.
import { createTutorial, type Status } from "../tutorial/engine";
import { hintKey, SCRIPT, stepKey } from "../tutorial/script";
import type { Facts, Target, TutorialEvent } from "../tutorial/types";
import type { UiContext } from "./context";
import { arrowSide, boxSide, cellsBox, union, visible, type Box } from "./tutorialGeometry";

const FLAG = "xt-tutorial";
const HINTS = "xt-hints";
const TIPS_OFF = "xt-tips-off";
/** the engine gets a tick about this often (seconds of the screen being free) */
const TICK_EVERY = 0.5;
/** a wave that comes with more than this on the timer was called by the player */
const BY_PLAYER = 0.1;

const rectOf = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

export function installCoach(ui: UiContext) {
  const { core: C, state: st, t, $, store, screens } = ui;

  const shown = (): Record<string, number> => {
    try {
      const o = JSON.parse(store.get(HINTS) ?? "{}");
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  };
  let tips = store.get(TIPS_OFF) !== "1";
  const tut = createTutorial(SCRIPT, { steps: false, shown: shown() });
  let last: Status = tut.status();
  /** this game was started with the steps (they may be done or skipped by now): it is not offered for the records */
  let tutorialGame = false;
  ui.inTutorial = () => tutorialGame;

  // ---- what the game is like, for the engine ---------------------------------------------------------------------

  const facts = (): Facts => {
    const S = C.S;
    const road = Math.max(0, ...Object.keys(C.ROUTES).map((r) => C.routePath(r as keyof typeof C.ROUTES).length));
    return {
      towers: S.towers.length,
      wave: S.wave,
      pathLength: road,
      creeps: S.creeps.length,
      timer: Number.isFinite(S.timer) ? Math.max(0, S.timer) : 9999,
      credits: Math.floor(S.credits),
    };
  };

  /** the timer as it was before the frame's steps: a wave that the timer itself sends comes with ~0 seconds left */
  let lastTimer = 0;
  /** the enemy types already announced in this game */
  const seen = new Set<string>();
  /** what each tower was when the engine last heard of it, to tell a level from an ultimate from an overclock */
  const known = new WeakMap<object, { lvl: number; oc: number }>();

  /** The steps run when they have not been done or skipped, and the game is the one they are written for. */
  const wanted = () => !store.get(FLAG) && st.level === SCRIPT.level && st.diff === SCRIPT.difficulty;

  function feed(ev: TutorialEvent) {
    tut.feed(ev);
    if (!tips) while (tut.view().hint) tut.dismissHint(); // the player has no tips: they are not shown (nor saved as shown)
    sync();
  }

  function sync() {
    const now = tut.status();
    if (last === "running" && now !== "running") store.set(FLAG, now === "skipped" ? "skipped" : "done");
    last = now;
    if (tips) store.set(HINTS, JSON.stringify(tut.shown()));
  }

  C.on((e) => {
    if (e.type === "reset") {
      tut.restart(wanted());
      tutorialGame = tut.status() === "running";
      last = tut.status();
      seen.clear();
      lastTimer = 0;
      hintLeft = 0;
      stepShown = "";
    } else if (e.type === "built") {
      known.set(e.tower, { lvl: e.tower.lvl, oc: e.tower.oc });
      feed({ type: "built", tower: e.tower.type, facts: facts() });
    } else if (e.type === "upgraded") {
      const was = known.get(e.tower) ?? { lvl: e.tower.lvl - 1, oc: e.tower.oc };
      const kind = e.tower.oc > was.oc ? "overclock" : e.tower.lvl === 4 && was.lvl === 3 ? "ultimate" : "level";
      known.set(e.tower, { lvl: e.tower.lvl, oc: e.tower.oc });
      feed({ type: "upgraded", kind, facts: facts() });
    } else if (e.type === "wave") {
      feed({ type: "wave", n: e.n, early: lastTimer > BY_PLAYER, timer: lastTimer, facts: facts() });
    }
  });

  // ---- the marks ---------------------------------------------------------------------------------------------------

  const root = $("coach"),
    col = $("coachCol"),
    box = $("coachBox"),
    hintBox = $("coachHint"),
    arrow = $("coachArrow"),
    rings = $("coachRings");
  let stepShown = "";
  let hintShown = "";
  let hintLeft = 0;

  /** the boxes of a step's target on the screen (none: the target is not on screen now) */
  function boxesOf(target: Target | undefined): Box[] {
    if (!target) return [];
    if ("selector" in target) {
      const el = document.querySelector(target.selector);
      return el ? [rectOf(el)].filter(visible) : [];
    }
    const field = rectOf($("field"));
    if (!visible(field)) return [];
    if ("cells" in target) return [cellsBox(target.cells, field, C.W, C.H, st.rotated)];
    // the entrances and the exits of every route
    return Object.values(C.ROUTES).flatMap((r) => [
      cellsBox(r.spawn, field, C.W, C.H, st.rotated),
      cellsBox(r.exit, field, C.W, C.H, st.rotated),
    ]);
  }

  const px = (n: number) => Math.round(n) + "px";

  function drawMarks(boxes: Box[], dim: boolean) {
    while (rings.children.length > boxes.length) rings.lastElementChild!.remove();
    while (rings.children.length < boxes.length) {
      const r = document.createElement("div");
      r.className = "coachRing";
      rings.append(r);
    }
    boxes.forEach((b, i) => {
      const r = rings.children[i] as HTMLElement;
      const pad = 5;
      r.style.cssText = `left:${px(b.x - pad)};top:${px(b.y - pad)};width:${px(b.w + 2 * pad)};height:${px(b.h + 2 * pad)}`;
      r.classList.toggle("dim", dim && i === 0 && boxes.length === 1);
    });
    arrow.hidden = boxes.length !== 1;
    if (boxes.length === 1) {
      const b = boxes[0];
      const above = arrowSide(b) === "above";
      arrow.textContent = above ? "▼" : "▲";
      arrow.style.left = px(b.x + b.w / 2 - 14);
      arrow.style.top = above ? px(b.y - 44) : px(b.y + b.h + 10);
    }
  }

  function render() {
    const cover = screens.covered || !root;
    const v = tut.view();
    root.hidden = cover || (!v.step && !v.hint);
    if (root.hidden) return;

    // the step
    const sv = v.step;
    box.hidden = !sv;
    let marked: Box | null = null;
    if (sv) {
      const key = sv.step.id + "|" + ui.i18n.lang;
      if (key !== stepShown) {
        stepShown = key;
        $("coachTxt").textContent = t(stepKey(sv.step.id));
        $("coachStep").textContent = t("tutStep", { i: sv.index, n: sv.total });
        $("coachSkip").textContent = t("tutSkip");
        $("coachNext").textContent = t("tutNext");
        // a target in a scrolled palette must be in sight
        const target = sv.step.target;
        if (target && "selector" in target)
          document.querySelector(target.selector)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      }
      $("coachNext").hidden = !sv.canNext;
      const boxes = boxesOf(sv.step.target);
      drawMarks(boxes, !!sv.step.target && "selector" in sv.step.target);
      marked = union(boxes);
    } else {
      drawMarks([], false);
      stepShown = "";
    }
    // the texts stand on the side of the screen that the marked thing is not on (the tip stands under the step)
    // on a phone the bottom is the dock (Start, speed, pause) and the palette: the texts never stand over them
    col.classList.toggle("bottom", ui.isDesk() && boxSide(marked, innerHeight) === "bottom");

    // the tip: next to the step, on the other side of the screen from it when both are there
    const hv = v.hint;
    hintBox.hidden = !hv;
    if (hv) {
      const key = hv.hint.id + "|" + ui.i18n.lang;
      if (key !== hintShown) {
        if (hintShown.split("|")[0] !== hv.hint.id) hintLeft = hv.hint.seconds;
        hintShown = key;
        $("coachHintTxt").textContent = t(hintKey(hv.hint.id));
      }
    } else hintShown = "";
  }

  // ---- the clock ---------------------------------------------------------------------------------------------------

  let acc = 0;
  /** called by the loop once a frame, before the game steps */
  ui.onFrame = (dt: number) => {
    if (screens.covered) {
      render();
      return;
    }
    lastTimer = Number.isFinite(C.S.timer) ? C.S.timer : 0;
    if (tut.view().hint) {
      hintLeft -= dt;
      if (hintLeft <= 0) {
        tut.dismissHint();
        sync();
      }
    }
    acc += dt;
    if (acc >= TICK_EVERY && !C.S.over) {
      acc = 0;
      const f = facts();
      for (const c of C.S.creeps)
        if (!seen.has(c.type)) {
          seen.add(c.type);
          feed({ type: "enemy", enemy: c.type, facts: f });
        }
      feed({ type: "tick", facts: f });
    }
    render();
  };

  // ---- the buttons -------------------------------------------------------------------------------------------------

  $("coachNext").addEventListener("click", () => {
    feed({ type: "next", facts: facts() });
    render();
  });
  function skip() {
    tut.skip();
    sync();
    render();
  }
  $("coachSkip").addEventListener("click", skip);
  $("coachHintX").addEventListener("click", () => {
    tut.dismissHint();
    sync();
    render();
  });

  return {
    /** a step is on screen (Escape skips it, when nothing else is there to close) */
    active: () => !screens.covered && !!tut.view().step,
    skip,
    /** the tutorial's steps run again, on the game they are written for (the caller starts that game) */
    rewind() {
      store.set(FLAG, "");
    },
    tips: () => tips,
    setTips(on: boolean) {
      tips = on;
      store.set(TIPS_OFF, on ? "" : "1");
      if (!on) while (tut.view().hint) tut.dismissHint();
      render();
    },
  };
}

export type Coach = ReturnType<typeof installCoach>;
