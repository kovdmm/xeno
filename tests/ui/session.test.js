// The session with a stand-in game and page: what the end of a game does, and what starting a new one cancels.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession } from "../../src/ui/session";
import { createState } from "../../src/ui/state";

function setup() {
  const els = new Proxy({}, { get: (t, id) => (t[id] ||= { hidden: false, textContent: "", innerHTML: "", classList: { toggle() {} } }) });
  let onEvent;
  const C = {
    S: { over: false, won: false, started: true, wave: 0, score: 0, lives: 5, cheated: false },
    FINAL: 200,
    LEVELS: { crossroads: { name: "Crossroads", map: { width: 4, height: 3, routes: {} } } },
    DIFF: { easy: { name: "Easy" } },
    on: (fn) => (onEvent = fn),
    newGame: () => Object.assign(C.S, { over: false, won: false, wave: 0 }),
  };
  const saved = [];
  const credits = vi.fn();
  const shown = [];
  const ui = {
    core: C,
    state: createState("easy", "crossroads", 0),
    t: (k) => k,
    where: () => "Crossroads · Easy",
    L: (o) => o.name,
    $: (id) => els[id],
    toast() {},
    refresh() {},
    sound: { play() {} },
    screens: { show: (id) => shown.push(id), hide() {}, isOpen: () => false },
  };
  const progress = { bestOf: () => 0, saveBest: (...a) => saved.push(a) };
  const session = createSession(ui, progress, credits, () => {});
  return { C, ui, credits, saved, shown, session, fire: (e) => onEvent(e) };
}

describe("the end of a game", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("a victory shows the win screen and rolls the credits after a moment", () => {
    const { C, fire, shown, credits } = setup();
    Object.assign(C.S, { over: true, won: true, wave: 200 });
    fire({ type: "end", won: true });
    expect(shown).toContain("over");
    expect(credits).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1800);
    expect(credits).toHaveBeenCalledOnce();
  });

  it("starting a new game before the credits roll cancels them", () => {
    const { C, fire, session, credits } = setup();
    Object.assign(C.S, { over: true, won: true, wave: 200 });
    fire({ type: "end", won: true });
    vi.advanceTimersByTime(900);
    session.newGame();
    vi.advanceTimersByTime(5000);
    expect(credits).not.toHaveBeenCalled();
  });

  it("the best wave is saved, unless the game was cheated", () => {
    const { C, fire, saved, ui } = setup();
    Object.assign(C.S, { over: true, wave: 17 });
    fire({ type: "end", won: false });
    expect(saved).toEqual([["crossroads", "easy", 17]]);
    expect(ui.state.best).toBe(17);
    Object.assign(C.S, { wave: 30, cheated: true });
    fire({ type: "end", won: false });
    expect(saved.length).toBe(1);
  });
});
