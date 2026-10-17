import { describe, it, expect } from "vitest";
import { cueOf } from "../../src/audio/sfx/cues";
import type { GameEvent } from "../../src/game/types";
import { SoundBank } from "../../src/audio/sfx/bank";
import { HUM_AUDIBLE, LaserHum, humTarget } from "../../src/audio/sfx/laser";
import { MIX_RULES, LOW_BUDGET } from "../../src/audio/sfx/mixRules";
import { Mixer } from "../../src/audio/sfx/mixer";
import { SFX_RATE, createRecipes, synth } from "../../src/audio/sfx/recipes";
import { mulberry32 } from "../helpers/load";
import { fakeOut, manualScheduler } from "../helpers/audio";

const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const recipes = () => createRecipes(mulberry32(5));
const NAMES = [...Object.keys(MIX_RULES), "laser"];

describe("recipes", () => {
  it("every effect has a mixing rule, and the laser loop its recipe", () => {
    const r = recipes();
    expect(Object.keys(r).sort()).toEqual(NAMES.sort());
    expect(Object.keys(MIX_RULES)).toHaveLength(30);
  });

  it.each(NAMES)("%s is finite, audible and the right length", (name) => {
    const [dur] = recipes()[name];
    const a = synth(recipes()[name]);
    expect(a.length).toBe(Math.floor(SFX_RATE * dur));
    expect(a.every(Number.isFinite)).toBe(true);
    expect(peak(a)).toBeGreaterThan(0.02);
    expect(peak(a)).toBeLessThan(6); // the WAV encoder soft-limits with tanh
  });

  it("noise comes from the injected generator: the same seed gives the same sound, another does not", () => {
    const render = (seed) => synth(createRecipes(mulberry32(seed)).boom);
    expect(render(1)).toEqual(render(1));
    expect(render(1)).not.toEqual(render(2));
  });

  it("recipes without noise do not depend on the generator at all", () => {
    const a = synth(createRecipes(mulberry32(1)).upgrade),
      b = synth(createRecipes(mulberry32(99)).upgrade);
    expect(a).toEqual(b);
  });

  it("each sound has its own state: playing one never disturbs another", () => {
    const r = recipes();
    const solo = synth(r.cannon);
    synth(r.gun);
    expect(synth(createRecipes(mulberry32(5)).cannon)).toEqual(solo);
  });
});

describe("mixing rules", () => {
  it("are sane for every sound", () => {
    for (const [name, r] of Object.entries(MIX_RULES)) {
      expect(r.volume, name).toBeGreaterThan(0);
      expect(r.volume, name).toBeLessThanOrEqual(1);
      expect(r.gap, name).toBeGreaterThanOrEqual(0);
      expect(r.voices, name).toBeGreaterThanOrEqual(1);
      expect([0, 1, 2, 3, 4], name).toContain(r.priority);
    }
  });

  it("combat chatter is low priority, game-changing events are not", () => {
    for (const n of ["gun", "cannon", "missile", "plasma", "frost", "boom", "pop", "heal", "blink"])
      expect(MIX_RULES[n].priority, n).toBe(0);
    for (const n of ["leak", "nuke", "stasis", "siren", "ult", "wave", "bosskill"])
      expect(MIX_RULES[n].priority, n).toBeGreaterThanOrEqual(2);
    expect(MIX_RULES.victory.priority).toBe(4);
  });
});

describe("mixer", () => {
  const mixer = (rand = () => 0.5) => new Mixer(MIX_RULES, rand);
  const names = (cmds) => cmds.map((c) => c.name);

  it("collects requests and plays them on flush, most important first", () => {
    const m = mixer();
    m.request("gun");
    m.request("leak");
    m.request("build");
    expect(names(m.flush(1))).toEqual(["leak", "build", "gun"]);
    expect(m.flush(2)).toEqual([]); // nothing is carried over
  });

  it("ignores unknown names", () => {
    const m = mixer();
    m.request("kazoo");
    expect(m.flush(1)).toEqual([]);
  });

  it("merges repeated requests into one louder voice (log of the count, at most ×1.6)", () => {
    const m = mixer();
    for (let i = 0; i < 3; i++) m.request("build");
    const [p] = m.flush(1);
    expect(p.volume).toBeCloseTo(MIX_RULES.build.volume * (1 + 0.25 * Math.log2(3)), 6);
    const m2 = mixer();
    m2.request("build", 1000);
    expect(m2.flush(1)[0].volume).toBeCloseTo(MIX_RULES.build.volume * 1.6, 6);
  });

  it("volume never exceeds 1", () => {
    const m = mixer();
    m.request("nuke", 1000);
    expect(m.flush(1)[0].volume).toBe(1);
  });

  it("enforces the minimum interval between plays of one sound", () => {
    const m = mixer();
    m.request("build");
    expect(m.flush(1)).toHaveLength(1);
    m.request("build");
    expect(m.flush(1.02)).toHaveLength(0); // build has a 50 ms gap
    m.request("build");
    expect(m.flush(1.1)).toHaveLength(1);
    expect(m.stats.build).toBe(2);
  });

  it("a sound without a gap can play every frame", () => {
    const m = mixer();
    for (let i = 0; i < 5; i++) {
      m.request("nuke");
      expect(m.flush(i * 0.016)).toHaveLength(1);
    }
  });

  it("cuts a burst of low-priority sounds to the budget; important ones are never dropped", () => {
    const m = mixer();
    const low = ["gun", "cannon", "missile", "plasma", "boom", "pop"];
    for (const n of low) m.request(n);
    expect(m.flush(1)).toHaveLength(LOW_BUDGET);
    for (const n of [...low, "leak", "nuke", "wave"]) m.request(n);
    const played = names(m.flush(1.3));
    for (const n of ["leak", "nuke", "wave"]) expect(played).toContain(n);
  });

  it("the budget renews every 100 ms", () => {
    const m = mixer();
    const total = () => Object.values(m.stats).reduce((a, b) => a + b, 0);
    for (let t = 0; t < 1; t += 0.025) {
      for (const n of ["gun", "cannon", "missile", "plasma", "boom", "pop"]) m.request(n);
      m.flush(t + 1);
    }
    // 40 frames over one second: at most LOW_BUDGET per 100 ms window (plus the first frame of each window)
    expect(total()).toBeGreaterThan(10);
    expect(total()).toBeLessThanOrEqual(LOW_BUDGET * 11);
  });

  it("ducks low-priority sounds as the field gets busier, and recovers", () => {
    const m = mixer();
    const vol = (t) => (m.request("boom", 30), m.flush(t)[0].volume);
    const first = vol(1);
    const busy = vol(1.2);
    expect(busy).toBeLessThan(first);
    // ...and with no requests the "busy" meter fades
    for (let t = 2; t < 6; t += 0.2) m.flush(t);
    expect(vol(6.5)).toBeGreaterThan(busy);
  });

  it("clear forgets pending requests", () => {
    const m = mixer();
    m.request("leak");
    m.clear();
    expect(m.flush(1)).toEqual([]);
  });

  it("playback rate varies a little around 1 using the injected generator", () => {
    const lo = new Mixer(MIX_RULES, () => 0),
      hi = new Mixer(MIX_RULES, () => 1);
    lo.request("build");
    hi.request("build");
    expect(lo.flush(1)[0].rate).toBeCloseTo(0.92);
    expect(hi.flush(1)[0].rate).toBeCloseTo(1.08);
  });

  it("is deterministic for a given generator", () => {
    const run = () => {
      const m = new Mixer(MIX_RULES, mulberry32(3));
      const out: unknown[] = [];
      for (let t = 0; t < 2; t += 0.05) {
        m.request("gun", 3);
        m.request("pop", 2);
        m.request("build");
        out.push(m.flush(t + 1));
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe("cues: game events → sounds", () => {
  const tower = (type: string, extra = {}) => ({ type, lvl: 0, oc: 0, ...extra });
  const cases: [object, string | undefined][] = [
    [{ type: "shot", tower: tower("gun") }, "gun"],
    [{ type: "shot", tower: tower("artillery") }, "arty"],
    [{ type: "shot", tower: tower("laser") }, undefined], // lasers hum instead
    [{ type: "shot", tower: tower("frost") }, undefined],
    [{ type: "pulse", tower: tower("frost"), r: 2, freeze: false }, "frost"],
    [{ type: "pulse", tower: tower("frost"), r: 2, freeze: true }, "freeze"],
    [{ type: "explode", kind: "shell", x: 0, y: 0, r: 1 }, "boom"],
    [{ type: "explode", kind: "missile", x: 0, y: 0, r: 1 }, "boom"],
    [{ type: "explode", kind: "meteor", x: 0, y: 0, r: 1 }, "bigboom"],
    [{ type: "explode", kind: "artillery", x: 0, y: 0, r: 1 }, "bigboom"],
    [{ type: "explode", kind: "nuke", x: 0, y: 0, r: 1 }, "nuke"],
    [{ type: "explode", kind: "nukeShell", x: 0, y: 0, r: 1 }, "nuke"],
    [{ type: "kill", creep: { boss: false }, x: 0, y: 0 }, "pop"],
    [{ type: "kill", creep: { boss: true }, x: 0, y: 0 }, "bosskill"],
    [{ type: "leak", creep: {} }, "leak"],
    [{ type: "wave", n: 3 }, "wave"],
    [{ type: "toast", key: "cleared" }, "cleared"],
    [{ type: "toast", key: "early" }, undefined],
    [{ type: "built", tower: tower("gun") }, "build"],
    [{ type: "upgraded", tower: tower("gun", { lvl: 2 }) }, "upgrade"],
    [{ type: "upgraded", tower: tower("gun", { lvl: 4, oc: 0 }) }, "ult"],
    [{ type: "upgraded", tower: tower("gun", { lvl: 4, oc: 1 }) }, "upgrade"],
    [{ type: "sold", tower: tower("gun") }, "sell"],
    [{ type: "cast", ability: "stasis" }, "stasis"],
    [{ type: "cast", ability: "meteor" }, "meteorcast"],
    [{ type: "cast", ability: "napalm" }, "fire"],
    [{ type: "cast", ability: "carpet" }, "plane"],
    [{ type: "cast", ability: "nuke" }, "siren"],
    [{ type: "heal", x: 0, y: 0, r: 1 }, "heal"],
    [{ type: "blink", x: 0, y: 0, x2: 1, y2: 1 }, "blink"],
    [{ type: "end", won: true }, "victory"],
    [{ type: "end", won: false }, "defeat"],
    [{ type: "reset" }, undefined],
    [{ type: "cheat", code: "x" }, undefined],
    [{ type: "rail", tower: tower("rail") }, undefined],
  ];
  it.each(cases)("%j → %s", (event, cue) => {
    expect(cueOf(event as GameEvent)).toBe(cue);
  });

  it("every cue names an existing sound", () => {
    for (const [, cue] of cases) if (cue) expect((MIX_RULES as Record<string, unknown>)[cue], cue).toBeDefined();
  });
});

describe("laser hum", () => {
  it("target volume grows with the beam count and is capped", () => {
    expect(humTarget(0)).toBe(0);
    expect(humTarget(1)).toBeCloseTo(0.17);
    expect(humTarget(4)).toBeGreaterThan(humTarget(1));
    expect(humTarget(10000)).toBe(0.32);
  });

  it("eases towards the target instead of jumping", () => {
    const h = new LaserHum();
    const v1 = h.update(0.016, 3);
    expect(v1).toBeGreaterThan(0);
    expect(v1).toBeLessThan(humTarget(3));
    let v = v1;
    for (let i = 0; i < 100; i++) v = h.update(0.016, 3);
    expect(v).toBeCloseTo(humTarget(3), 3);
  });

  it("fades out below the audible threshold when the beams stop", () => {
    const h = new LaserHum();
    for (let i = 0; i < 100; i++) h.update(0.016, 2);
    let v = h.volume;
    for (let i = 0; i < 200; i++) v = h.update(0.016, 0);
    expect(v).toBeLessThan(HUM_AUDIBLE);
    h.reset();
    expect(h.volume).toBe(0);
  });

  it("a long frame cannot overshoot", () => {
    const h = new LaserHum();
    expect(h.update(10, 1)).toBeCloseTo(humTarget(1));
  });
});

describe("sound bank", () => {
  const bank = (out = fakeOut()) => ({ out, bank: new SoundBank(out, recipes(), MIX_RULES) });

  it("builds a sound only when it is first needed, once", () => {
    const { out, bank: b } = bank();
    expect(out.sounds).toHaveLength(0);
    const h = b.get("gun");
    expect(b.get("gun")).toBe(h);
    expect(out.sounds).toHaveLength(1);
    expect(out.sounds[0].opts).toEqual({ volume: MIX_RULES.gun.volume, voices: MIX_RULES.gun.voices });
    expect(out.sounds[0].sampleRate).toBe(SFX_RATE);
    expect(b.built()).toEqual(["gun"]);
  });

  it("an unknown sound fails loudly", () => {
    expect(() => bank().bank.get("kazoo")).toThrow();
  });

  it("warm-up builds the rest one sound per task, skipping what already exists", () => {
    const { out, bank: b } = bank();
    b.get("nuke");
    const s = manualScheduler();
    b.warmUp(s.schedule);
    expect(out.sounds).toHaveLength(1); // nothing built synchronously
    expect(s.pending()).toBe(1);
    const before = out.sounds.length;
    s.run(1); // one task builds exactly one sound
    expect(out.sounds.length).toBe(before + 1);
    s.run();
    expect(out.sounds).toHaveLength(30);
    expect(new Set(b.built()).size).toBe(30);
  });
});
