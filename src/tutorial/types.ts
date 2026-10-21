// The tutorial's contract: what the script (tutorial.yaml) looks like, what the interface feeds the engine and what it
// gets back to draw. The engine (engine.ts) is pure: no DOM, no timers, no storage; the interface owns those.
//
//   interface  --feed(TutorialEvent)-->  engine  --view()-->  { step, hint }  --draws-->  box, ring, arrow
//
// The engine only watches the game (through events and facts); it never changes it. Skipping, finishing and the
// "done" flag are the interface's: it calls `skip()` and saves `xt-tutorial` = "done" | "skipped" when `view()` is null.

/** What the interface tells the engine. `facts` is a fresh snapshot of the game, sent with every event. */
export type TutorialEvent =
  /** a tower was placed (type: the tower's id in balance.towers) */
  | { type: "built"; tower: string; facts: Facts }
  /** an upgrade was bought: a level, an ultimate pick or an overclock */
  | { type: "upgraded"; kind: "level" | "ultimate" | "overclock"; facts: Facts }
  /** a wave was sent, by the timer or by the player (early: the timer had `timer` seconds left) */
  | { type: "wave"; n: number; early: boolean; timer: number; facts: Facts }
  /** a wave's first enemy of a type appeared on the field (enemy: id in balance.enemies) */
  | { type: "enemy"; enemy: string; facts: Facts }
  /** the player pressed "Next" in the box */
  | { type: "next"; facts: Facts }
  /** about twice a second while a game runs: lets conditions about the field and the clock be checked */
  | { type: "tick"; facts: Facts };

/** What the interface reads off the game. */
export interface Facts {
  /** towers on the board now */
  towers: number;
  /** the highest wave sent */
  wave: number;
  /** the length of the shortest road from the entrance to the exit, in cells (the longest of the routes) */
  pathLength: number;
  /** enemies on the field now */
  creeps: number;
  /** seconds until the next wave comes by itself */
  timer: number;
  credits: number;
}

/** What the engine counts itself from the events (the interface does not send these). */
export interface Progress {
  /** levels bought since the tutorial began (each upgrade 1-4 counts one) */
  upgrades: number;
  /** ultimates picked (the level-5 choice) */
  ultimates: number;
  /** overclocks bought */
  overclocks: number;
  /** waves the player sent with the timer above `Script.earlyTimer` */
  earlyCalls: number;
  /** cells the shortest road is longer than when the current step began (0 or more) */
  pathGain: number;
}

/** The numbers a condition may ask for. All are "at least" thresholds in the script. */
export type Need = Partial<Record<keyof Facts | keyof Progress, number>>;

/** What a step points at. The interface finds it on screen; a missing target is just not highlighted. */
export type Target =
  /** an element by CSS selector, e.g. "#go", '.tb[data-t="gun"]', "#info [data-act=up]" */
  | { selector: string }
  /** cells of the board, in board coordinates (the interface turns them with the field) */
  | { cells: [number, number][] }
  /** the entrances and exits of the routes */
  | { gates: true };

export interface Step {
  /** unique, lower-case kebab-case; its text is `stepKey(id)` (`tutBuildGun` for `build-gun`) in texts.*.json (ui) */
  id: string;
  /** where to look; omitted: only the box is shown */
  target?: Target;
  /** the step is over when every number in `until` has been reached (facts are compared with `>=`);
   *  `until: next` waits for the player to press "Next" (the text-only steps) */
  until: Need | "next";
  /** counters that start from 0 when this step begins instead of counting from the game's start
   *  (upgrades, ultimates, overclocks, earlyCalls); pathGain always does */
  fresh?: (keyof Progress)[];
}

/** A one-off tip, shown when its condition first holds. */
export interface Hint {
  /** unique; its text is `hintKey(id)` (`tutHintArmored`) */
  id: string;
  /** `enemy`: the first time that enemy type appears (any game, not only the tutorial);
   *  `idle`: in a game, a wave was sent, the field has at most `creeps` enemies and the timer is above `timer` and the
   *  player has called fewer than `earlyCalls` waves early, i.e. "you could call the next wave now" */
  when: { enemy: string } | { idle: { creeps: number; timer: number; earlyCalls: number } };
  /** shown for this many seconds unless the player closes it (the interface keeps the clock) */
  seconds: number;
  /** how many times it may be shown in all (saved by the interface); default 1 */
  times?: number;
  /** also outside the tutorial (a normal game); the player can switch hints off in the settings */
  always?: boolean;
}

export interface Script {
  /** the map and difficulty the tutorial game is played on */
  level: string;
  difficulty: string;
  /** a wave called with more than this many seconds left on the timer counts as an early call */
  earlyTimer: number;
  steps: Step[];
  hints: Hint[];
}

/** What the interface draws now. */
export interface StepView {
  step: Step;
  /** 1-based position and the number of steps, for "3 / 9" */
  index: number;
  total: number;
  /** the "Next" button is shown (until: next) */
  canNext: boolean;
}

export interface HintView {
  hint: Hint;
}

export interface TutorialView {
  step: StepView | null;
  /** a hint to show next to (or over) the step, or null */
  hint: HintView | null;
}
