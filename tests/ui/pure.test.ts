// The parts of the interface that are plain functions and data: formatting, keys, state, saved progress,
// layout maths, the text panels and what the renderer is asked to show.
import { describe, it, expect } from "vitest";
import { fmt } from "../../src/ui/format";
import { CheatTyper, escapeAction, hotkey, physicalDigit, physicalLetter, spaceAction } from "../../src/ui/keys";
import { clearPicks, createState, speedOf, SPEEDS } from "../../src/ui/state";
import { createProgress } from "../../src/ui/progress";
import { createScreens, SCREENS } from "../../src/ui/screens";
import { fitAspect, turnsOnDesktop } from "../../src/ui/layout";
import { diffColor, skullIcon, DIFF_LOOK } from "../../src/ui/difficulty";
import { towerCard, idleCard, nextLine } from "../../src/ui/cards";
import { buildView } from "../../src/ui/view";
import type { Tower, TowerType } from "../../src/game/types";
import type { GameCore } from "../../src/core";
import { loadXT } from "../helpers/load";

/** builds a tower that must be allowed */
const put = (C: GameCore, type: TowerType, x: number, y: number): Tower => {
  const r = C.place(type, x, y);
  if (!r.ok) throw new Error("place refused: " + r.code);
  return r.tower;
};
import { memoryStore } from "../helpers/audio";

describe("fmt", () => {
  it("keeps small numbers exact and shortens big ones", () => {
    expect(fmt(7.25)).toBe(7.3);
    expect(fmt(99.94)).toBe(99.9);
    expect(fmt(120.4)).toBe(120);
    expect(fmt(9999)).toBe(9999);
    expect(fmt(12345)).toBe("12k");
    expect(fmt(3_400_000)).toBe("3.4M");
    expect(fmt(2.5e9)).toBe("2.5B");
    expect(fmt(7e12)).toBe("7.0T");
  });
});

describe("hotkeys", () => {
  it("map the Russian and Ukrainian layouts to the Latin letter on the same key", () => {
    expect(hotkey("Ы")).toBe("s");
    expect(hotkey("і")).toBe("s");
    expect(hotkey("а")).toBe("f");
    expect(hotkey("Ц")).toBe("w");
    expect(hotkey("Escape")).toBe("escape");
    expect(hotkey("1")).toBe("1");
  });

  it("digits come from the key code too (on AZERTY the number row types symbols)", () => {
    expect(physicalDigit("Digit1")).toBe("1");
    expect(physicalDigit("Numpad8")).toBe("8");
    expect(physicalDigit("KeyA")).toBe("");
    expect(physicalDigit(undefined)).toBe("");
  });

  it("the physical letter comes from the key code, not the layout", () => {
    expect(physicalLetter("KeyH")).toBe("h");
    expect(physicalLetter("Digit1")).toBe("");
    expect(physicalLetter(undefined)).toBe("");
  });
});

describe("CheatTyper", () => {
  const typed = (keys: string, codes = ["hesoyam"]) => {
    const fired: string[] = [];
    const c = new CheatTyper(codes, (code) => fired.push(code));
    return { fired, swallowed: [...keys].map((k) => c.feed(k)) };
  };

  it("fires when the whole code is typed, and swallows its letters while it is typed", () => {
    const { fired, swallowed } = typed("hesoyam");
    expect(fired).toEqual(["hesoyam"]);
    expect(swallowed.every(Boolean)).toBe(true);
  });

  it("a wrong letter breaks the code and is not swallowed; a new start is", () => {
    const { fired, swallowed } = typed("hesx");
    expect(fired).toEqual([]);
    expect(swallowed).toEqual([true, true, true, false]);
    const again = typed("hehesoyam");
    expect(again.fired).toEqual(["hesoyam"]);
  });

  it("ordinary letters are not swallowed", () => {
    expect(typed("qwerty").swallowed.some(Boolean)).toBe(false);
  });
});

describe("Escape and Space", () => {
  const none = { settings: false, help: false, pause: false, menu: false, over: false };
  it("Escape closes the topmost thing first, and pauses only when nothing else is to be done", () => {
    expect(escapeAction({ ...none, settings: true, help: true, pause: true }, true)).toBe("close-settings");
    expect(escapeAction({ ...none, help: true, pause: true }, false)).toBe("close-help");
    expect(escapeAction({ ...none, pause: true }, false)).toBe("resume");
    expect(escapeAction({ ...none, menu: true }, true)).toBe("nothing");
    expect(escapeAction({ ...none, over: true }, false)).toBe("nothing");
    expect(escapeAction(none, true)).toBe("clear-picks");
    expect(escapeAction(none, false)).toBe("pause");
  });

  it("Space toggles the pause screen but leaves the title and end screens alone", () => {
    expect(spaceAction(none)).toBe("pause");
    expect(spaceAction({ ...none, pause: true })).toBe("resume");
    expect(spaceAction({ ...none, menu: true })).toBe("nothing");
    expect(spaceAction({ ...none, over: true })).toBe("nothing");
  });
});

describe("UiState", () => {
  it("starts paused with nothing in hand, and clearPicks empties the hand", () => {
    const s = createState("hard", "corner", 7);
    expect([s.paused, s.sel, s.build, s.aim, s.diff, s.level, s.best]).toEqual([
      true,
      null,
      null,
      null,
      "hard",
      "corner",
      7,
    ]);
    s.build = "gun";
    s.aim = "meteor";
    s.sel = {} as Tower;
    clearPicks(s);
    expect([s.sel, s.build, s.aim]).toEqual([null, null, null]);
  });

  it("speed is zero while paused, otherwise the chosen one", () => {
    const s = createState("easy", "crossroads", 0);
    expect(speedOf(s)).toBe(0);
    s.paused = false;
    s.speedIdx = 2;
    expect(speedOf(s)).toBe(SPEEDS[2]);
  });
});

describe("saved progress", () => {
  const LEVELS = [
    { id: "crossroads", finalWave: 200 },
    { id: "corner", finalWave: 80 },
  ];
  const make = (init = {}) => {
    const store = memoryStore(init);
    return { store, p: createProgress(store, ["easy", "normal", "hard", "insane"], LEVELS) };
  };

  it("defaults to easy and the first level, ignores unknown saved ones, remembers valid ones", () => {
    const fresh = make().p;
    expect([fresh.readDiff(), fresh.readLevel()]).toEqual(["easy", "crossroads"]);
    const junk = make({ "xt-diff": "nightmare", "xt-level": "nowhere" }).p;
    expect([junk.readDiff(), junk.readLevel()]).toEqual(["easy", "crossroads"]);
    const { p } = make();
    p.saveDiff("hard");
    p.saveLevel("corner");
    expect([p.readDiff(), p.readLevel()]).toEqual(["hard", "corner"]);
  });

  it("keeps the best wave per level and difficulty, capped at that level's last wave", () => {
    const { p } = make();
    expect(p.bestOf("crossroads", "hard")).toBe(0);
    p.saveBest("crossroads", "hard", 31);
    expect(p.bestOf("crossroads", "hard")).toBe(31);
    expect(p.bestOf("crossroads", "easy")).toBe(0);
    expect(p.bestOf("corner", "hard")).toBe(0); // another map, its own record
    p.saveBest("corner", "hard", 500);
    expect(p.bestOf("corner", "hard")).toBe(80);
    p.saveBest("crossroads", "normal", 999);
    expect(p.bestOf("crossroads", "normal")).toBe(200);
  });

  it("keeps a record per map and difficulty under a key of its own", () => {
    const { p, store } = make();
    p.saveBest("crossroads", "hard", 7);
    p.saveBest("corner", "hard", 9);
    expect(store.get("xt-best-crossroads-hard")).toBe("7");
    expect(store.get("xt-best-corner-hard")).toBe("9");
    expect([p.bestOf("crossroads", "hard"), p.bestOf("corner", "hard"), p.bestOf("corner", "easy")]).toEqual([7, 9, 0]);
  });

  it("does not read the records of older versions (no migration)", () => {
    const { p } = make({ "xt-best": "12", "xt-best-easy": "5" });
    expect(p.bestOf("crossroads", "easy")).toBe(0);
    expect(p.bestOf("corner", "easy")).toBe(0);
  });
});

describe("screens", () => {
  const setup = () => {
    const els: Record<string, { hidden: boolean }> = Object.fromEntries(
      [...SCREENS, "fsAsk"].map((id) => [id, { hidden: true }]),
    );
    const seen: boolean[] = [];
    const s = createScreens(
      (id) => els[id] as HTMLElement,
      (covered) => void seen.push(covered),
    );
    return { els, seen, s };
  };

  it("the game is covered while any of the pausing screens is open", () => {
    const { s, seen } = setup();
    expect(s.covered).toBe(false);
    s.show("menu");
    s.show("settings");
    s.hide("menu");
    expect(s.covered).toBe(true);
    s.hide("settings");
    expect(s.covered).toBe(false);
    expect(seen).toEqual([true, true, true, false]);
  });

  it("the fullscreen question does not pause the game", () => {
    const { s } = setup();
    s.show("fsAsk");
    expect(s.isOpen("fsAsk")).toBe(true);
    expect(s.covered).toBe(false);
  });
});

describe("layout maths", () => {
  it("fits the largest field of a given shape into the free space", () => {
    expect(fitAspect(1000, 1000, 2)).toEqual([1000, 500]);
    expect(fitAspect(1000, 300, 2)).toEqual([600, 300]);
  });

  it("on desktop the board turns only when that makes it clearly bigger", () => {
    expect(turnsOnDesktop(1200, 700, 22, 15)).toBe(false); // a wide window
    expect(turnsOnDesktop(500, 1100, 22, 15)).toBe(true); // a tall one
    expect(turnsOnDesktop(900, 900, 22, 15)).toBe(false); // square: no gain at all
    expect(turnsOnDesktop(600, 700, 22, 15)).toBe(true); // 16% bigger turned
    expect(turnsOnDesktop(660, 700, 22, 15)).toBe(false); // only 6%: not worth turning
  });
});

describe("difficulty look", () => {
  it("has a look for every difficulty; skulls are counted", () => {
    expect(Object.keys(DIFF_LOOK)).toEqual(["easy", "normal", "hard", "insane"]);
    expect(skullIcon("hard").match(/<svg/g)!.length).toBe(3);
    expect(skullIcon("insane")).toContain("big");
    expect(diffColor("insane")).toBe(DIFF_LOOK.insane.edge);
    expect(diffColor("easy")).toBe(DIFF_LOOK.easy.col);
  });
});

describe("text panels and the view, on the real game", () => {
  const setup = () => {
    const XT = loadXT(["core"], { seed: 5 });
    const C = XT.core;
    C.newGame("easy");
    C.cheat("hesoyam");
    const env = {
      core: C,
      t: (k: string, v?: Record<string, string | number>) => XT.i18n.t(k, v),
      L: (o, f = "name") => o[f],
      routeLabel: (r) => r,
      tierColor: (l) => "#" + l + l + l,
    };
    return { C, env };
  };

  it("the card of a tower shows its stats, the next level and the sell price", () => {
    const { C, env } = setup();
    const html = towerCard(env, put(C, "gun", 6, 5));
    expect(html).toContain("Machine Gun");
    expect(html).toContain("lvl 1/5");
    expect(html).toContain('data-act="up"');
    expect(html).toContain('data-act="sell"');
    expect(html).toContain("→"); // what the next level changes
    expect(html).toContain("color:#000"); // the tier colour of level 1
  });

  it("at level 4 the card offers both specialisations; at level 5 the overclock", () => {
    const { C, env } = setup();
    const tower = put(C, "gun", 6, 5);
    C.upgrade(tower);
    C.upgrade(tower);
    C.upgrade(tower);
    const four = towerCard(env, tower);
    expect((four.match(/data-u="/g) || []).length).toBe(2);
    C.upgrade(tower, Object.keys(C.TT.gun.ults)[0]);
    const five = towerCard(env, tower);
    expect(five).toContain("lvl 5");
    expect(five).not.toContain("data-u=");
    expect(five).toContain('data-act="up"'); // overclock
  });

  it("the upgrade button is disabled when the player cannot pay", () => {
    const { C, env } = setup();
    const tower = put(C, "gun", 6, 5);
    C.S.credits = 0;
    expect(towerCard(env, tower)).toMatch(/data-act="up" disabled/);
  });

  it("the idle card explains what is being built or aimed, or the commands", () => {
    const { C, env } = setup();
    expect(idleCard(env, { build: "cannon", aim: null, diff: "easy" })).toContain("Cannon");
    expect(idleCard(env, { build: null, aim: "meteor", diff: "easy" })).toContain("Meteors");
    expect(idleCard(env, { build: null, aim: null, diff: "hard" })).toContain("Hard");
    void C;
  });

  it("the line about what comes next: the first wave, the next one, the final one, or what is picked", () => {
    const { C, env } = setup();
    expect(nextLine(env, { build: null, aim: null })).toMatch(/wave/i);
    expect(nextLine(env, { build: "gun", aim: null })).toContain("Machine Gun");
    expect(nextLine(env, { build: null, aim: "stasis" })).toContain("Stasis");
    C.S.wave = C.FINAL;
    expect(nextLine(env, { build: null, aim: null })).toBe(env.t("finalWave"));
  });

  it("the view carries the selection, and a ghost tower only over a free cell it can pay for", () => {
    const { C } = setup();
    const st = createState("easy", "crossroads", 0);
    expect(buildView(C, st, 3).preview).toBeNull();
    st.build = "gun";
    st.hover = [8.5, 5.5];
    let v = buildView(C, st, 3);
    expect(v.t).toBe(3);
    expect(v.building).toBe(true);
    expect(v.preview).toMatchObject({ type: "gun", ok: true });
    C.S.credits = 1;
    expect(buildView(C, st, 3).preview!.ok).toBe(false); // free cell, too expensive: shown red
    st.hover = [-1, -1];
    expect(buildView(C, st, 3).preview).toBeNull(); // off the board: nothing
    st.build = null;
    st.aim = "meteor";
    st.hover = [4.2, 3.1];
    v = buildView(C, st, 3);
    expect(v.aim).toMatchObject({ shape: "circle", x: 4.2, y: 3.1 });
    expect(v.aim!.r).toBeGreaterThan(0);
    C.S.over = true;
    expect(buildView(C, st, 3).aim).toBeNull();
  });
});
