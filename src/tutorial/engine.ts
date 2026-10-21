// The tutorial engine: which step the player is on and which hint is due. Pure: it watches the events and facts the
// interface sends (types.ts) and never touches the game, the DOM, a clock or storage.
import type { Facts, Hint, HintView, Need, Progress, Script, Step, TutorialEvent, TutorialView } from "./types";

export type Status = "off" | "running" | "done" | "skipped";

export interface TutorialOptions {
  /** run the steps (the first game of a new player); false: only the hints that are meant for every game */
  steps?: boolean;
  /** how many times each hint was shown before (the interface saves `shown()`) */
  shown?: Record<string, number>;
}

const ZERO: Progress = { upgrades: 0, ultimates: 0, overclocks: 0, earlyCalls: 0, pathGain: 0 };
const COUNTERS = ["upgrades", "ultimates", "overclocks", "earlyCalls"] as const;

export function createTutorial(script: Script, opts: TutorialOptions = {}) {
  const shown: Record<string, number> = { ...opts.shown };
  let status: Status = opts.steps === false ? "off" : "running";
  let at = 0;
  let total: Progress = { ...ZERO };
  /** the counters and the road length when the current step began */
  let base: Progress = { ...ZERO };
  let road0 = 0;
  let road = 0;
  let facts: Facts | null = null;
  let hintQueue: Hint[] = [];
  let hint: Hint | null = null;
  /** enemy types seen in this game, so that a wave does not announce the same type twice */
  const seenNow = new Set<string>();
  /** the wave an idle hint was last offered at: once per wave, or it would come back the moment it is closed */
  const idleAt = new Map<string, number>();

  const hintOk = (h: Hint) => (h.always || status === "running") && (shown[h.id] ?? 0) < (h.times ?? 1);
  const queued = (h: Hint) => hint === h || hintQueue.includes(h);

  function offer(h: Hint) {
    if (!hintOk(h) || queued(h)) return;
    if (!hint) show(h);
    else hintQueue.push(h);
  }
  function show(h: Hint) {
    hint = h;
    shown[h.id] = (shown[h.id] ?? 0) + 1;
  }
  function nextHint() {
    hint = null;
    while (hintQueue.length) {
      const h = hintQueue.shift()!;
      if (hintOk(h)) return show(h);
    }
  }

  const progress = (): Progress => {
    const p = { ...total, pathGain: Math.max(0, road - road0) };
    for (const k of COUNTERS) p[k] = total[k] - base[k];
    return p;
  };
  /** the counters as the current step sees them: fresh ones from its start, the others from the game's start */
  function value(step: Step, k: keyof Facts | keyof Progress): number {
    if (k === "pathGain") return Math.max(0, road - road0);
    if ((COUNTERS as readonly string[]).includes(k)) {
      const c = k as (typeof COUNTERS)[number];
      return step.fresh?.includes(c) ? total[c] - base[c] : total[c];
    }
    return facts ? facts[k as keyof Facts] : 0;
  }
  const reached = (step: Step, need: Need) =>
    Object.entries(need).every(([k, n]) => value(step, k as keyof Need) >= (n as number));

  function begin() {
    base = { ...total };
    road0 = road;
  }

  /** Moves on while the current step's numbers are already reached (a text step waits for "next"). */
  function advance() {
    while (status === "running") {
      const step = script.steps[at];
      if (!step) {
        status = "done";
        return;
      }
      if (step.until === "next" || !reached(step, step.until)) return;
      at++;
      begin();
    }
  }

  function checkHints(ev: TutorialEvent) {
    const f = ev.facts;
    for (const h of script.hints) {
      if ("enemy" in h.when) {
        if (ev.type === "enemy" && ev.enemy === h.when.enemy) offer(h);
      } else if (ev.type === "tick") {
        const w = h.when.idle;
        if (
          f.wave >= 1 &&
          f.creeps <= w.creeps &&
          f.timer > w.timer &&
          total.earlyCalls < w.earlyCalls &&
          (idleAt.get(h.id) ?? 0) < f.wave
        ) {
          idleAt.set(h.id, f.wave);
          offer(h);
        }
      }
    }
  }

  function feed(ev: TutorialEvent): void {
    facts = ev.facts;
    road = ev.facts.pathLength;
    if (status === "running" && at === 0 && road0 === 0) road0 = road;
    switch (ev.type) {
      case "upgraded":
        total[ev.kind === "level" ? "upgrades" : ev.kind === "ultimate" ? "ultimates" : "overclocks"]++;
        break;
      case "wave":
        if (ev.early && ev.timer > script.earlyTimer) total.earlyCalls++;
        break;
      case "enemy":
        if (seenNow.has(ev.enemy)) return;
        seenNow.add(ev.enemy);
        break;
      case "next": {
        const step = script.steps[at];
        if (status === "running" && step && step.until === "next") {
          at++;
          begin();
        }
        break;
      }
    }
    advance();
    checkHints(ev);
  }

  return {
    feed,
    status: (): Status => status,
    /** what to draw now */
    view(): TutorialView {
      const step = status === "running" ? script.steps[at] : undefined;
      return {
        step: step ? { step, index: at + 1, total: script.steps.length, canNext: step.until === "next" } : null,
        hint: hint ? ({ hint } as HintView) : null,
      };
    },
    /** the player closed the hint, or its time ran out */
    dismissHint: nextHint,
    /** the player skipped the tutorial: the steps end, the hints for every game go on */
    skip() {
      if (status === "running") status = "skipped";
    },
    /** a new game: the counters and the steps start again (hints keep what they showed) */
    restart(withSteps = true) {
      status = withSteps ? "running" : "off";
      at = 0;
      total = { ...ZERO };
      base = { ...ZERO };
      road0 = 0;
      road = 0;
      hint = null;
      hintQueue = [];
      seenNow.clear();
      idleAt.clear();
    },
    /** how many times each hint was shown: the interface saves it */
    shown: (): Record<string, number> => ({ ...shown }),
    /** the counters, for the interface's own use (and the tests) */
    progress,
  };
}

export type Tutorial = ReturnType<typeof createTutorial>;
