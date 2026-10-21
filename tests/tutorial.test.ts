// The tutorial: the script is valid, every step and tip has a text in every language, and the engine walks the steps
// from the events it is fed.
import { describe, expect, it } from "vitest";
import { BALANCE } from "../src/game/balance";
import { TEXTS } from "../src/i18n/texts";
import { createTutorial } from "../src/tutorial/engine";
import { hintKey, SCRIPT, stepKey, validateScript } from "../src/tutorial/script";
import type { Facts, Script, TutorialEvent } from "../src/tutorial/types";

const CODES = ["en", "ru", "de", "ua", "sv"] as const;

describe("the script (tutorial.yaml)", () => {
  it("is valid against the game's data", () => {
    expect(validateScript(SCRIPT, BALANCE)).toEqual([]);
  });

  it("is played on the first map on easy, where a new player starts", () => {
    expect([SCRIPT.level, SCRIPT.difficulty]).toEqual([Object.keys(BALANCE.levels)[0], "easy"]);
  });

  it("teaches the lessons the owner wants: early calls, upgrades, level 5 and the maze", () => {
    const ids = SCRIPT.steps.map((s) => s.id);
    for (const id of ["maze", "call-early", "upgrade", "level-five"]) expect(ids).toContain(id);
    expect(SCRIPT.hints.map((h) => h.id)).toContain("early-call");
    // an early call is asked for before upgrades, and the first enemy types have a tip each
    expect(ids.indexOf("call-early")).toBeLessThan(ids.indexOf("upgrade"));
    for (const e of ["armored", "flyer"])
      expect(SCRIPT.hints.some((h) => "enemy" in h.when && h.when.enemy === e)).toBe(true);
  });

  it("is rejected when it is wrong", () => {
    const bad = (f: (s: any) => void) => {
      const s = structuredClone(SCRIPT) as any;
      f(s);
      return validateScript(s, BALANCE).join("\n");
    };
    expect(bad((s) => (s.level = "nowhere"))).toMatch(/level: not a level/);
    expect(bad((s) => (s.steps[1].id = "goal"))).toMatch(/used twice/);
    expect(bad((s) => (s.steps[1].id = "Build_Gun"))).toMatch(/lower-case words/);
    expect(bad((s) => (s.steps[1].until = { cows: 2 }))).toMatch(/until\.cows: unknown number/);
    expect(bad((s) => (s.steps[1].until = {}))).toMatch(/until: expected/);
    expect(bad((s) => (s.steps[3].fresh = ["towers"]))).toMatch(/not a counter/);
    expect(bad((s) => (s.steps[1].target = { selector: "#a", gates: true }))).toMatch(/target: expected one of/);
    expect(bad((s) => (s.hints[1].when = { enemy: "dragon" }))).toMatch(/not an enemy/);
    expect(bad((s) => (s.hints[0].when = { idle: { creeps: 1 } }))).toMatch(/when\.idle/);
    expect(bad((s) => (s.hints[0].times = 0))).toMatch(/times/);
  });
});

describe.each(CODES)("the texts of the tutorial in %s", (c) => {
  const ui = (TEXTS[c].ui ?? {}) as Record<string, string>;

  it("has a text for every step and every tip", () => {
    for (const s of SCRIPT.steps) expect(ui[stepKey(s.id)], stepKey(s.id)).toBeTypeOf("string");
    for (const h of SCRIPT.hints) expect(ui[hintKey(h.id)], hintKey(h.id)).toBeTypeOf("string");
  });

  it("has the texts of the buttons", () => {
    for (const k of ["tutNext", "tutSkip", "tutStep", "tutReplay"]) expect(ui[k], k).toBeTypeOf("string");
    expect(ui.tutStep).toContain("{i}");
    expect(ui.tutStep).toContain("{n}");
  });

  it("has no text for a step or a tip that is not in the script", () => {
    const known = new Set([
      ...SCRIPT.steps.map((s) => stepKey(s.id)),
      ...SCRIPT.hints.map((h) => hintKey(h.id)),
      "tutNext",
      "tutSkip",
      "tutStep",
      "tutReplay",
    ]);
    expect(Object.keys(ui).filter((k) => /^tut[A-Z]/.test(k) && !known.has(k))).toEqual([]);
  });

  it("keeps every step to a few short sentences", () => {
    for (const s of SCRIPT.steps) expect(ui[stepKey(s.id)].length, stepKey(s.id)).toBeLessThanOrEqual(260);
    for (const h of SCRIPT.hints) expect(ui[hintKey(h.id)].length, hintKey(h.id)).toBeLessThanOrEqual(260);
  });
});

describe("the engine", () => {
  const facts = (f: Partial<Facts> = {}): Facts => ({
    towers: 0,
    wave: 0,
    pathLength: 40,
    creeps: 0,
    timer: 20,
    credits: 100,
    ...f,
  });
  const ev = {
    built: (f?: Partial<Facts>): TutorialEvent => ({ type: "built", tower: "gun", facts: facts(f) }),
    up: (kind: "level" | "ultimate" | "overclock" = "level", f?: Partial<Facts>): TutorialEvent => ({
      type: "upgraded",
      kind,
      facts: facts(f),
    }),
    wave: (n: number, early: boolean, timer: number, f?: Partial<Facts>): TutorialEvent => ({
      type: "wave",
      n,
      early,
      timer,
      facts: facts({ wave: n, ...f }),
    }),
    enemy: (enemy: string, f?: Partial<Facts>): TutorialEvent => ({ type: "enemy", enemy, facts: facts(f) }),
    next: (f?: Partial<Facts>): TutorialEvent => ({ type: "next", facts: facts(f) }),
    tick: (f?: Partial<Facts>): TutorialEvent => ({ type: "tick", facts: facts(f) }),
  };
  const id = (t: ReturnType<typeof createTutorial>) => t.view().step?.step.id ?? null;

  it("walks the real script: text steps wait for Next, the others for the player's action", () => {
    const t = createTutorial(SCRIPT);
    expect(id(t)).toBe("goal");
    expect(t.view().step).toMatchObject({ index: 1, total: SCRIPT.steps.length, canNext: true });
    t.feed(ev.tick()); // time passing does not end a text step
    expect(id(t)).toBe("goal");
    t.feed(ev.next());
    expect(id(t)).toBe("build-gun");
    expect(t.view().step!.canNext).toBe(false);
    t.feed(ev.built({ towers: 1 }));
    expect(id(t)).toBe("maze");
    t.feed(ev.built({ towers: 3 }));
    expect(id(t)).toBe("maze");
    t.feed(ev.built({ towers: 4 }));
    expect(id(t)).toBe("call-early");
    // a wave that came by itself (the timer ran out) is not an early call; one called with the timer nearly out (1 s) is not either
    t.feed(ev.wave(1, false, 0));
    t.feed(ev.wave(2, true, 1));
    expect(id(t)).toBe("call-early");
    t.feed(ev.wave(3, true, 15));
    expect(id(t)).toBe("call-early-again");
    t.feed(ev.wave(4, true, 12)); // "again": one more call is enough
    expect(id(t)).toBe("upgrade");
    t.feed(ev.up());
    expect(id(t)).toBe("upgrade");
    t.feed(ev.up());
    expect(id(t)).toBe("level-five");
    for (const next of ["abilities", "finish"]) {
      t.feed(ev.next());
      expect(id(t)).toBe(next);
    }
    t.feed(ev.next());
    expect(t.status()).toBe("done");
    expect(t.view().step).toBeNull();
  });

  it("a player who waits for the field to clear and calls late still gets through the early-call steps", () => {
    const t = createTutorial(SCRIPT);
    t.feed(ev.next());
    t.feed(ev.built({ towers: 4 }));
    expect(id(t)).toBe("call-early");
    // the field was cleared as the timer ran down: 3 s are left, which counts
    t.feed(ev.wave(1, true, 3));
    expect(id(t)).toBe("call-early-again");
    t.feed(ev.wave(2, true, 2.5));
    expect(id(t)).toBe("upgrade");
  });

  it("a step that waits for an action offers Next after a minute without progress, and Next then moves on", () => {
    const t = createTutorial(SCRIPT);
    t.feed(ev.next());
    expect(id(t)).toBe("build-gun");
    for (let i = 0; i < SCRIPT.stuckTicks - 1; i++) t.feed(ev.tick());
    expect(t.view().step!.canNext).toBe(false);
    t.feed(ev.tick());
    expect(t.view().step!.canNext).toBe(true);
    t.feed(ev.next());
    expect(id(t)).toBe("maze");
    expect(t.view().step!.canNext).toBe(false); // the clock starts again for the next step
    t.feed(ev.next()); // Next is not accepted before the wait
    expect(id(t)).toBe("maze");
  });

  it("counts a fresh counter from the start of its step", () => {
    const script: Script = {
      ...SCRIPT,
      steps: [
        { id: "a", until: { upgrades: 1 } },
        { id: "b", until: { upgrades: 2 }, fresh: ["upgrades"] },
        { id: "c", until: { upgrades: 3 } },
      ],
      hints: [],
    };
    const t = createTutorial(script);
    t.feed(ev.up());
    expect(id(t)).toBe("b");
    t.feed(ev.up());
    expect(id(t)).toBe("b"); // one since b began
    t.feed(ev.up());
    expect(t.status()).toBe("done"); // c wanted 3 in all, and there are 3: it is over at once
  });

  it("measures the road from the start of the step", () => {
    const script: Script = { ...SCRIPT, steps: [{ id: "a", until: { pathGain: 6 } }], hints: [] };
    const t = createTutorial(script);
    t.feed(ev.tick({ pathLength: 40 }));
    t.feed(ev.tick({ pathLength: 44 }));
    expect(id(t)).toBe("a");
    t.feed(ev.tick({ pathLength: 46 }));
    expect(t.status()).toBe("done");
  });

  it("skipping ends the steps; the tips for every game go on", () => {
    const t = createTutorial(SCRIPT);
    t.skip();
    expect(t.status()).toBe("skipped");
    expect(t.view().step).toBeNull();
    t.feed(ev.enemy("armored"));
    expect(t.view().hint?.hint.id).toBe("armored");
  });

  it("a normal game (no steps) shows only the tips meant for every game", () => {
    const script: Script = {
      ...SCRIPT,
      hints: [
        { id: "only-tutorial", when: { enemy: "flyer" }, seconds: 5 },
        { id: "everywhere", when: { enemy: "armored" }, seconds: 5, always: true },
      ],
    };
    const t = createTutorial(script, { steps: false });
    expect(t.status()).toBe("off");
    t.feed(ev.enemy("flyer"));
    expect(t.view().hint).toBeNull();
    t.feed(ev.enemy("armored"));
    expect(t.view().hint?.hint.id).toBe("everywhere");
  });

  it("an enemy's tip comes once, queues behind another, and is not shown again in a later game", () => {
    const t = createTutorial(SCRIPT);
    t.feed(ev.enemy("armored"));
    t.feed(ev.enemy("flyer"));
    expect(t.view().hint?.hint.id).toBe("armored");
    t.feed(ev.enemy("armored")); // the same type again: nothing new
    t.dismissHint();
    expect(t.view().hint?.hint.id).toBe("flyer");
    t.dismissHint();
    expect(t.view().hint).toBeNull();
    expect(t.shown()).toMatchObject({ armored: 1, flyer: 1 });
    // a new game of the same player: what was shown stays shown
    const later = createTutorial(SCRIPT, { steps: false, shown: t.shown() });
    later.feed(ev.enemy("armored"));
    expect(later.view().hint).toBeNull();
    later.feed(ev.enemy("swarm"));
    expect(later.view().hint?.hint.id).toBe("swarm");
  });

  it("the early-call tip needs a wave, a clear field and time on the clock, and comes once per wave", () => {
    const t = createTutorial(SCRIPT, { steps: false });
    const idle = (wave: number, creeps = 1, timer = 15) => t.feed(ev.tick({ wave, creeps, timer }));
    idle(0); // no wave yet
    expect(t.view().hint).toBeNull();
    idle(1, 9); // the field is full
    idle(1, 1, 2); // nearly time for the next wave anyway
    expect(t.view().hint).toBeNull();
    idle(1);
    expect(t.view().hint?.hint.id).toBe("early-call");
    t.dismissHint();
    idle(1); // the same wave: not again
    expect(t.view().hint).toBeNull();
    idle(2);
    expect(t.view().hint?.hint.id).toBe("early-call");
  });

  it("stops asking for early calls once the player makes them", () => {
    const t = createTutorial(SCRIPT, { steps: false });
    for (let n = 1; n <= 4; n++) t.feed(ev.wave(n, true, 15));
    t.feed(ev.tick({ wave: 5, creeps: 0, timer: 15 }));
    expect(t.view().hint).toBeNull();
  });

  it("restart begins the steps again", () => {
    const t = createTutorial(SCRIPT);
    t.feed(ev.next());
    t.feed(ev.built({ towers: 1 }));
    expect(id(t)).toBe("maze");
    t.restart();
    expect(id(t)).toBe("goal");
    expect(t.progress()).toMatchObject({ upgrades: 0, earlyCalls: 0 });
  });
});
