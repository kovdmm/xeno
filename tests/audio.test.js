import { describe, it, expect } from "vitest";
import { loadXT, run } from "./helpers/load.js";

const SFX = [
  "gun", "cannon", "missile", "plasma", "rail", "arty", "frost", "freeze", "boom", "bigboom", "nuke", "pop",
  "bosskill", "leak", "wave", "cleared", "build", "upgrade", "ult", "sell", "error", "stasis", "meteorcast",
  "fire", "plane", "siren", "heal", "blink", "victory", "defeat", "laser",
];

/** Minimal stand-ins for howler.js: record what the game asks for, play nothing. */
function fakeHowler() {
  const howls = [];
  class Howl {
    constructor(o) {
      this.o = o;
      this.plays = [];
      this.vols = [];
      this.rates = [];
      this.stops = 0;
      this.pauses = 0;
      this.live = new Set();
      this.n = 0;
      this._sounds = [];
      howls.push(this);
    }
    play(id) {
      id = id ?? ++this.n;
      this.live.add(id);
      this.plays.push(id);
      this._sounds.push({ _paused: false, _ended: false });
      return id;
    }
    volume(v, id) {
      this.vols.push([v, id]);
      return this;
    }
    rate(r) {
      this.rates.push(r);
    }
    playing(id) {
      return id === undefined ? this.live.size > 0 : this.live.has(id);
    }
    stop(id) {
      this.live.delete(id);
      this.stops++;
    }
    pause() {
      this.live.clear();
      this.pauses++;
    }
  }
  const Howler = { muted: null, volume() {}, mute(m) { Howler.muted = m; }, ctx: null };
  return { Howl, Howler, howls };
}

function setup({ storage = {} } = {}) {
  const { Howl, Howler, howls } = fakeHowler();
  const timers = [];
  const listeners = {};
  const store = { ...storage };
  const XT = loadXT(["core", "audio"], {
    globals: {
      Howl,
      Howler,
      setTimeout: (fn) => timers.push(fn),
      addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => void (store[k] = String(v)),
      },
    },
  });
  XT.core.newGame("easy");
  XT.core.S.credits = 1e6;
  return { XT, A: XT.audio, C: XT.core, howls, Howler, timers, listeners, store };
}

const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const rms = (a, from, to) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
};

describe("music score", () => {
  const { A } = setup();
  const m = A._music();

  it("is a 16-bar loop at 96 BPM: 40 s of 16 kHz audio", () => {
    expect(m.constructor.name).toBe("Float32Array"); // another realm, so no instanceof
    expect(m.length).toBe(16000 * 40);
  });

  it("is deterministic (no Math.random in the composition)", () => {
    const again = setup().A._music();
    expect(again.every((x, i) => x === m[i])).toBe(true);
  });

  it("is finite, has headroom and is bit-crushed to 1/40 steps", () => {
    expect(m.every(Number.isFinite)).toBe(true);
    expect(peak(m)).toBeLessThanOrEqual(0.8 + 1e-6);
    expect(peak(m)).toBeGreaterThan(0.5);
    for (let i = 0; i < m.length; i += 997) expect(Math.abs(m[i] * 40 - Math.round(m[i] * 40))).toBeLessThan(1e-4);
  });

  it("every bar is audible and the arrangement is fuller from bar 5 (drums and lead join)", () => {
    const bar = m.length / 16;
    const r = Array.from({ length: 16 }, (_, b) => rms(m, b * bar, (b + 1) * bar));
    for (const x of r) expect(x).toBeGreaterThan(0.05);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(mean(r.slice(0, 4))).toBeLessThan(mean(r.slice(4)));
  });

  it("the drum track hits the downbeat of every bar", () => {
    const bar = m.length / 16;
    const att = 16000 * 0.02; // first 20 ms of a bar vs. the 20 ms before it
    for (let b = 1; b < 16; b++) {
      const after = rms(m, b * bar, b * bar + att);
      const before = rms(m, b * bar - 4 * att, b * bar - 3 * att);
      expect(after, `bar ${b}`).toBeGreaterThan(before * 0.8);
    }
  });
});

describe("sound effect recipes", () => {
  const { A } = setup();

  it.each(SFX)("%s is finite, audible and the right length", (name) => {
    const a = A._synth(name);
    expect(a.length).toBeGreaterThan(1000);
    expect(a.every(Number.isFinite)).toBe(true);
    expect(peak(a)).toBeGreaterThan(0.02);
    expect(peak(a)).toBeLessThan(6); // the WAV encoder soft-limits with tanh
  });

  it("an unknown recipe fails loudly", () => {
    expect(() => A._synth("nope")).toThrow();
  });
});

describe("init and settings", () => {
  it("builds one Howl per sound + the laser loop, and music only after a delay", () => {
    const { howls, timers, A } = setup();
    const sounds = howls.filter((h) => !h.o.loop);
    expect(sounds.length).toBe(SFX.length - 1); // every recipe except the laser loop
    expect(howls.filter((h) => h.o.loop)).toHaveLength(1);
    expect(A.musicPlaying()).toBe(false);
    timers.splice(0).forEach((f) => f());
    expect(howls.filter((h) => h.o.loop)).toHaveLength(2);
  });

  it("reads saved settings, clamps and falls back on garbage", () => {
    expect(setup({ storage: { "xt-vol": "0.2", "xt-mvol": "0.9", "xt-mute": "1" } }).A).toMatchObject({
      volume: 0.2,
      musicVolume: 0.9,
      muted: true,
    });
    expect(setup({ storage: { "xt-vol": "7", "xt-mvol": "-3" } }).A).toMatchObject({ volume: 1, musicVolume: 0 });
    expect(setup({ storage: { "xt-vol": "abc", "xt-mvol": "abc" } }).A).toMatchObject({
      volume: 0.7,
      musicVolume: 0.5,
    });
  });

  it("setters persist and mute reaches Howler", () => {
    const { A, Howler, store } = setup();
    A.setMuted(true);
    A.setVolume(0.3);
    A.setMusicVolume(0.4);
    expect(Howler.muted).toBe(true);
    expect(store).toMatchObject({ "xt-mute": "1", "xt-vol": "0.3", "xt-mvol": "0.4" });
  });

  it("without howler the module degrades to silence", () => {
    const XT = loadXT(["core", "audio"]);
    XT.core.newGame("easy");
    expect(XT.audio.ok).toBe(false);
    expect(() => {
      XT.audio.play("gun");
      XT.audio.update(0.1, false);
    }).not.toThrow();
  });
});

describe("music playback", () => {
  it("keeps a single instance however often it is kicked", () => {
    const { howls, timers, listeners, A } = setup();
    timers.splice(0).forEach((f) => f());
    const music = howls.find((h) => h.o.loop && h.o.volume > 0);
    expect(music.plays).toHaveLength(1);
    for (let i = 0; i < 5; i++) listeners.pointerdown.forEach((f) => f());
    expect(music.plays).toHaveLength(1);
    expect(A.musicPlaying()).toBe(true);
    expect(A._musicCount()).toBe(1);
  });

  it("volume 0 pauses, raising it resumes the same instance", () => {
    const { howls, timers, A } = setup();
    timers.splice(0).forEach((f) => f());
    const music = howls.find((h) => h.o.loop && h.o.volume > 0);
    A.setMusicVolume(0);
    expect(music.pauses).toBe(1);
    A.setMusicVolume(0.5);
    expect(music.plays).toHaveLength(2);
    expect(music.plays[1]).toBe(music.plays[0]); // resumed by id
  });
});

describe("mixer", () => {
  const played = (A, name) => A.stats[name] || 0;

  it("core events become sounds, flushed once per frame", () => {
    const { A, C } = setup();
    C.place("gun", 5, 5);
    expect(played(A, "build")).toBe(0); // queued only
    A.update(0.016, false);
    expect(played(A, "build")).toBe(1);
  });

  it("same-name events in one frame merge into one, louder voice", () => {
    const { A, C, howls } = setup();
    for (let x = 4; x < 7; x++) C.place("gun", x, 5);
    A.update(0.016, false);
    expect(played(A, "build")).toBe(1);
    const vols = howls.flatMap((h) => h.vols).filter(([, id]) => id !== undefined);
    const v = Math.max(...vols.map(([x]) => x));
    expect(v).toBeCloseTo(0.35 * (1 + 0.25 * Math.log2(3)) * A.volume, 5);
  });

  it("respects the minimum interval between plays of one sound", () => {
    const { A, C } = setup();
    C.place("gun", 4, 5);
    A.update(0.016, false);
    C.place("gun", 5, 5);
    A.update(0.016, false); // 16 ms later: build has a 50 ms gap
    expect(played(A, "build")).toBe(1);
    C.place("gun", 6, 5);
    A.update(0.06, false);
    expect(played(A, "build")).toBe(2);
  });

  it("randomises playback rate a little", () => {
    const { A, C, howls } = setup();
    C.place("gun", 4, 5);
    A.update(0.016, false);
    const rates = howls.flatMap((h) => h.rates);
    expect(rates).toHaveLength(1);
    expect(rates[0]).toBeGreaterThanOrEqual(0.92);
    expect(rates[0]).toBeLessThanOrEqual(1.08);
  });

  it("nothing plays while paused, and queued sounds are dropped", () => {
    const { A, C } = setup();
    C.place("gun", 4, 5);
    A.update(0.016, true);
    A.update(0.016, false);
    expect(played(A, "build")).toBe(0);
  });

  it("a new game clears the queue", () => {
    const { A, C } = setup();
    C.place("gun", 4, 5);
    C.newGame("easy");
    A.update(0.016, false);
    expect(played(A, "build")).toBe(0);
  });

  it("low-priority combat sounds are capped at ~20 plays per second", () => {
    const { A, C } = setup();
    C.S.credits = 1e6;
    for (let x = 2; x < 14; x++) C.place("gun", x, 5);
    for (let x = 2; x < 10; x++) C.place("cannon", x, 9);
    A.stats = {};
    C.sendWave();
    const secs = 40;
    for (let t = 0; t < secs; t += 0.025) {
      if (C.S.over) break;
      C.step(0.025);
      A.update(0.025, false);
    }
    const low = ["gun", "cannon", "missile", "plasma", "boom", "pop"].reduce((n, k) => n + played(A, k), 0);
    expect(low).toBeGreaterThan(10);
    expect(low).toBeLessThanOrEqual(20 * secs + 2);
  });

  it("a burst of low-priority sounds in one frame is cut to the budget of 2", () => {
    const { A } = setup();
    for (const n of ["gun", "cannon", "missile", "plasma", "boom", "pop"]) A.play(n);
    A.update(0.016, false);
    const low = ["gun", "cannon", "missile", "plasma", "boom", "pop"].filter((k) => played(A, k));
    expect(low).toHaveLength(2);
    // important sounds in the same burst are never dropped
    for (const n of ["gun", "cannon", "missile", "leak", "nuke", "wave"]) A.play(n);
    A.update(0.3, false);
    for (const k of ["leak", "nuke", "wave"]) expect(played(A, k), k).toBe(1);
  });

  it("important sounds (leaks, wave start) bypass the budget", () => {
    const { A, C } = setup();
    C.sendWave();
    for (let t = 0; t < 80; t += 0.025) {
      C.step(0.025);
      A.update(0.025, false);
    }
    expect(played(A, "wave")).toBeGreaterThan(0);
    expect(played(A, "leak")).toBeGreaterThan(0);
  });

  it("ending the game plays victory or defeat", () => {
    const { A, C } = setup();
    C.S.lives = 1;
    C.sendWave();
    for (let t = 0; t < 120 && !C.S.over; t += 0.025) {
      C.step(0.025);
      A.update(0.025, false);
    }
    A.update(0.025, false);
    expect(played(A, "defeat")).toBe(1);
    expect(played(A, "victory")).toBe(0);
  });

  it("every ability cast maps to a distinct cast sound", () => {
    const { A, C } = setup();
    const want = { stasis: "stasis", meteor: "meteorcast", napalm: "fire", carpet: "plane", nuke: "siren" };
    for (const [ab, snd] of Object.entries(want)) {
      C.cast(ab, [5, 5]);
      A.update(2, false);
      expect(played(A, snd), ab).toBe(1);
    }
  });

  it("upgrading to the ultimate sounds different from a normal upgrade", () => {
    const { A, C } = setup();
    const t = C.place("gun", 5, 5).tower;
    for (let i = 0; i < 3; i++) C.upgrade(t);
    A.update(1, false);
    expect(played(A, "upgrade")).toBeGreaterThan(0);
    C.upgrade(t, "mini");
    A.update(1, false);
    expect(played(A, "ult")).toBe(1);
  });
});

describe("laser hum", () => {
  it("starts when beams fire, follows their count, and stops when idle", () => {
    const { A, C, howls } = setup();
    const hum = howls.find((h) => h.o.loop);
    expect(hum.o.volume).toBe(0);
    C.place("laser", 6, 5);
    A.update(0.1, false);
    expect(hum.plays).toHaveLength(0);
    C.sendWave();
    for (let t = 0; t < 30 && !hum.plays.length; t += 0.025) {
      C.step(0.025);
      A.update(0.025, false);
    }
    expect(hum.plays).toHaveLength(1);
    const v = hum.vols.at(-1)[0];
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(0.32 * A.volume + 1e-9);
    // pause kills the hum
    A.update(0.025, true);
    expect(hum.live.size).toBe(0);
  });
});
