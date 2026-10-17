// The legacy-facing adapter (src/audio.js): howler backend + localStorage + core events + laser beams.
import { describe, it, expect } from "vitest";
import { loadXT, run } from "../helpers/load.js";

function fakeGlobals() {
  const howls = [];
  const store = {};
  class Howl {
    constructor(o) {
      this.o = o;
      this.calls = [];
      this.n = 0;
      this.map = new Map(); // id -> { _paused, _ended }, like Howler's own sound pool
      howls.push(this);
    }
    get _sounds() {
      return [...this.map.values()];
    }
    play(id) {
      id = id ?? ++this.n;
      const s = this.map.get(id) ?? { _paused: false, _ended: false };
      s._paused = false;
      this.map.set(id, s);
      this.calls.push(["play", id]);
      return id;
    }
    volume(v, id) {
      this.calls.push(["volume", v, id]);
    }
    rate(r, id) {
      this.calls.push(["rate", r, id]);
    }
    playing(id) {
      const live = (s) => !s._paused && !s._ended;
      return id === undefined ? [...this.map.values()].some(live) : !!this.map.get(id) && live(this.map.get(id));
    }
    stop(id) {
      this.map.delete(id);
      this.calls.push(["stop", id]);
    }
    pause() {
      for (const s of this.map.values()) s._paused = true;
      this.calls.push(["pause"]);
    }
  }
  const Howler = { volume() {}, mute() {}, ctx: null };
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => void (store[k] = String(v)),
  };
  return { Howl, Howler, localStorage, howls, store };
}

function setup(extra = {}) {
  const timers = [];
  const g = fakeGlobals();
  const XT = loadXT(["core", "audio"], {
    globals: {
      Howl: g.Howl,
      Howler: g.Howler,
      localStorage: g.localStorage,
      setTimeout: (fn) => timers.push(fn),
      ...extra,
    },
  });
  XT.core.newGame("easy");
  XT.core.S.credits = 1e6;
  const flush = () => {
    for (let i = 0; timers.length && i < 200; i++) timers.shift()();
  };
  return { XT, A: XT.audio, C: XT.core, ...g, flush };
}

describe("installAudio", () => {
  it("exposes what the UI uses", () => {
    const { A } = setup();
    for (const k of [
      "ok",
      "muted",
      "volume",
      "musicVolume",
      "play",
      "update",
      "setMuted",
      "setVolume",
      "setMusicVolume",
    ])
      expect(A[k], k).toBeDefined();
    expect(A.ok).toBe(true);
  });

  it("degrades to silence when howler.js did not load", () => {
    const XT = loadXT(["core", "audio"]);
    expect(XT.audio.ok).toBe(false);
    expect(() => {
      XT.audio.play("gun");
      XT.audio.update(0.1, false);
    }).not.toThrow();
  });

  it("core events make sound: building and starting a wave", () => {
    const { A, C } = setup();
    C.place("gun", 5, 5);
    C.sendWave();
    A.update(0.2, false);
    expect(A.stats).toMatchObject({ build: 1, wave: 1 });
  });

  it("laser beams in the game state make the hum play", () => {
    const { A, C, howls, flush } = setup();
    flush();
    C.place("laser", 6, 5);
    C.sendWave();
    for (let t = 0; t < 40; t += 0.025) {
      C.step(0.025);
      A.update(0.025, false);
    }
    const hum = howls.find((h) => h.o.loop && h.o.volume === 0);
    expect(hum, "the hum was created").toBeDefined();
    expect(hum.calls.filter((c) => c[0] === "play").length).toBeGreaterThan(0);
  });

  it("music is built after the delay and keeps a single copy through volume changes", () => {
    const { A, howls, flush } = setup();
    expect(howls.filter((h) => h.o.loop)).toHaveLength(0);
    flush();
    const music = howls.filter((h) => h.o.loop && h.o.volume > 0);
    expect(music).toHaveLength(1);
    for (const v of [0.9, 0, 0.5, 0, 0.2]) A.setMusicVolume(v);
    expect(A.musicPlaying()).toBe(true);
    expect(A.musicCopies()).toBe(1);
  });

  it("settings persist to localStorage under the same keys as before", () => {
    const { A, store } = setup();
    A.setMuted(true);
    A.setVolume(0.25);
    A.setMusicVolume(0.75);
    expect(store).toMatchObject({ "xt-mute": "1", "xt-vol": "0.25", "xt-mvol": "0.75" });
  });

  it("a thrown localStorage (private window) is survived", () => {
    const boom = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    const { A } = setup({ localStorage: boom });
    expect(A.volume).toBe(0.7);
    expect(() => A.setVolume(0.3)).not.toThrow();
  });
});
