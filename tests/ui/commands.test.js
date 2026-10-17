// The commands with a stand-in game: what each one asks of the game and what it tells the player.
import { describe, it, expect } from "vitest";
import { createCommands } from "../../src/ui/commands";
import { createState } from "../../src/ui/state";

function setup(core = {}) {
  const toasts = [],
    played = [],
    log = [];
  const C = {
    S: { over: false, started: false, wave: 0 },
    FINAL: 200,
    TT: { gun: { name: "Gun", ults: { a: { name: "Alpha" } } } },
    AB: { stasis: { name: "Stasis", aim: 0 }, meteor: { name: "Meteors", aim: "circle" } },
    buildOrigin: (type, pt) => pt.map(Math.floor),
    place: (...a) => (log.push(["place", ...a]), { ok: true }),
    upgrade: (...a) => (log.push(["upgrade", ...a]), { ok: true }),
    sell: (...a) => log.push(["sell", ...a]),
    cast: (...a) => (log.push(["cast", ...a]), { ok: true }),
    sendWave: (...a) => log.push(["sendWave", ...a]),
    ...core,
  };
  const state = createState("easy", 0);
  const ui = {
    core: C,
    state,
    t: (k, v) => (v ? `${k}:${JSON.stringify(v)}` : k),
    L: (o) => o.name,
    toast: (m) => toasts.push(m),
    sound: { play: (n) => played.push(n) },
    refresh: () => log.push(["refresh"]),
  };
  let speedDrawn = 0;
  return { cmd: createCommands(ui, () => speedDrawn++), C, state, toasts, played, log, speed: () => speedDrawn };
}

describe("commands", () => {
  it("placing uses the build origin of the pointed cell", () => {
    const { cmd, state, log } = setup();
    state.build = "gun";
    cmd.placeAt([4.7, 5.2]);
    expect(log).toContainEqual(["place", "gun", 4, 5]);
  });

  it("a refusal becomes a message and an error sound, except the quiet ones", () => {
    const { cmd, state, toasts, played } = setup({ place: () => ({ ok: false, code: "pcRes" }) });
    state.build = "gun";
    cmd.placeAt([1, 1]);
    expect(toasts).toEqual(["pcRes"]);
    expect(played).toEqual(["error"]);
    for (const quiet of ["busy", "out", "over", ""]) cmd.say(quiet);
    expect(toasts).toEqual(["pcRes"]);
  });

  it("upgrading announces a chosen specialisation", () => {
    const { cmd, state, toasts } = setup({ upgrade: () => ({ ok: true, ult: "a" }) });
    state.sel = { type: "gun" };
    cmd.upgrade("a");
    expect(toasts).toEqual(["Gun: Alpha!"]);
  });

  it("upgrading with nothing selected does nothing", () => {
    const { cmd, log } = setup();
    cmd.upgrade();
    expect(log).toEqual([]);
  });

  it("selling forgets the selection", () => {
    const { cmd, state, log } = setup();
    state.sel = { id: 1 };
    cmd.sell();
    expect(log[0][0]).toBe("sell");
    expect(state.sel).toBeNull();
  });

  it("a cast on cooldown says how long, and returns false", () => {
    const { cmd, toasts } = setup({ cast: () => ({ ok: false, code: "cd", s: 12 }) });
    expect(cmd.cast("stasis")).toBe(false);
    expect(toasts).toEqual(['cdToast:{"a":"Stasis","s":12}']);
  });

  it("an ability without aim goes off at once; an aimed one is picked, and picking again drops it", () => {
    const { cmd, state, log } = setup();
    cmd.selectAbility("stasis");
    expect(log).toContainEqual(["cast", "stasis", undefined]);
    expect(state.aim).toBeNull();
    cmd.selectAbility("meteor");
    expect(state.aim).toBe("meteor");
    cmd.selectAbility("meteor");
    expect(state.aim).toBeNull();
  });

  it("picking a tower drops the selection and the aim; picking it again drops it", () => {
    const { cmd, state } = setup();
    state.sel = { id: 1 };
    state.aim = "meteor";
    cmd.selectBuild("gun");
    expect([state.build, state.sel, state.aim]).toEqual(["gun", null, null]);
    cmd.selectBuild("gun");
    expect(state.build).toBeNull();
  });

  it("nothing can be picked after the game is over", () => {
    const { cmd, state, C } = setup();
    C.S.over = true;
    cmd.selectAbility("meteor");
    expect(state.aim).toBeNull();
  });

  it("calling a wave: early once started, not at all after the final wave or the end", () => {
    const { cmd, C, log } = setup();
    cmd.goBtn();
    expect(log).toContainEqual(["sendWave", false]);
    C.S.started = true;
    cmd.goBtn();
    expect(log).toContainEqual(["sendWave", true]);
    log.length = 0;
    C.S.wave = 200;
    cmd.goBtn();
    C.S.wave = 3;
    C.S.over = true;
    cmd.goBtn();
    expect(log.filter((l) => l[0] === "sendWave")).toEqual([]);
  });

  it("the speed cycles through the four steps and redraws the button", () => {
    const { cmd, state, speed } = setup();
    const seen = [state.speedIdx];
    for (let i = 0; i < 4; i++) {
      cmd.cycleSpeed();
      seen.push(state.speedIdx);
    }
    expect(seen).toEqual([0, 1, 2, 3, 0]);
    expect(speed()).toBe(4);
  });
});
