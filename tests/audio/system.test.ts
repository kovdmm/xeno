import { describe, it, expect } from "vitest";
import { createAudioSystem } from "../../src/audio/system";
import { createGame } from "../../src/game/game";
import { MIX_RULES } from "../../src/audio/sfx/mixRules";
import { MUSIC_GAIN } from "../../src/audio/music/player";
import { fakeOut, manualScheduler, memoryStore } from "../helpers/audio";
import { mulberry32 } from "../helpers/load";

function setup({
  storage = {},
  available = true,
  beams,
}: { storage?: Record<string, string>; available?: boolean; beams?: () => number } = {}) {
  const out = fakeOut({ available });
  const store = memoryStore(storage);
  const sched = manualScheduler();
  const A = createAudioSystem({ out, storage: store, rng: mulberry32(9), schedule: sched.schedule, beams });
  return { A, out, store, sched };
}
const played = (out) => out.sounds.flatMap((s) => s.plays);

describe("start-up", () => {
  it("is quiet at first: nothing synthesised, music not composed, backend muted as saved", () => {
    const { A, out, sched } = setup({ storage: { "xt-mute": "1" } });
    expect(A.ok).toBe(true);
    expect(out.sounds).toHaveLength(0);
    expect(out.loops).toHaveLength(0);
    expect(out.muted).toBe(true);
    expect(out.gestures).toHaveLength(1);
    expect(sched.pending()).toBe(2); // the sound warm-up and the music build
    expect(sched.delays()).toContain(400); // music waits for the first frame
  });

  it("the background tasks build every sound and then the music", () => {
    const { A, out, sched } = setup();
    sched.run();
    expect(out.sounds).toHaveLength(Object.keys(MIX_RULES).length);
    expect(out.loops).toHaveLength(1);
    expect(out.loops[0].sampleRate).toBe(16000);
    expect(A.musicPlaying()).toBe(true);
  });

  it("without a backend everything is a harmless no-op", () => {
    const { A, out, sched } = setup({ available: false });
    expect(A.ok).toBe(false);
    expect(sched.pending()).toBe(0);
    expect(() => {
      A.play("gun");
      A.handleEvent({ type: "wave", n: 1 });
      A.update(0.1, false);
      A.setMuted(true);
      A.setMusicVolume(0.2);
    }).not.toThrow();
    expect(out.sounds).toHaveLength(0);
    expect(A.musicPlaying()).toBe(false);
  });
});

describe("settings", () => {
  it("reads saved values, clamps and falls back on garbage", () => {
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
    expect(setup().A).toMatchObject({ volume: 0.7, musicVolume: 0.5, muted: false });
  });

  it("setters persist, and mute reaches the backend", () => {
    const { A, out, store } = setup();
    A.setMuted(true);
    A.setVolume(0.3);
    A.setMusicVolume(0.4);
    expect(out.muted).toBe(true);
    expect(store.data).toMatchObject({ "xt-mute": "1", "xt-vol": "0.3", "xt-mvol": "0.4" });
    A.setMuted(false);
    expect(store.data["xt-mute"]).toBe("0");
  });

  it("settings still change and persist without a backend", () => {
    const { A, store } = setup({ available: false });
    A.setVolume(0.1);
    expect(A.volume).toBe(0.1);
    expect(store.data["xt-vol"]).toBe("0.1");
  });
});

describe("sound effects", () => {
  it("requests are played on the next update, scaled by the master volume, building the sound on first use", () => {
    const { A, out } = setup({ storage: { "xt-vol": "0.5" } });
    A.play("build");
    expect(out.sounds).toHaveLength(0);
    A.update(0.016, false);
    expect(out.sounds).toHaveLength(1);
    expect(played(out)).toHaveLength(1);
    expect(played(out)[0].volume).toBeCloseTo(MIX_RULES.build.volume * 0.5);
    expect(A.stats.build).toBe(1);
  });

  it("nothing plays while paused, and queued sounds are dropped", () => {
    const { A, out } = setup();
    A.play("build");
    A.update(0.016, true);
    A.update(0.016, false);
    expect(played(out)).toHaveLength(0);
  });

  it("a reset event clears the queue", () => {
    const { A, out } = setup();
    A.play("build");
    A.handleEvent({ type: "reset" });
    A.update(0.016, false);
    expect(played(out)).toHaveLength(0);
  });

  it("game events become sounds", () => {
    const { A, out } = setup();
    A.handleEvent({ type: "wave", n: 1 });
    A.handleEvent({ type: "end", won: false });
    A.handleEvent({ type: "toast", key: "early" }); // silent
    A.update(0.016, false);
    expect(A.stats).toEqual({ defeat: 1, wave: 1 });
    expect(played(out)).toHaveLength(2);
  });

  it("the master volume change applies to later plays", () => {
    const { A, out } = setup();
    A.setVolume(0);
    A.play("leak");
    A.update(0.016, false);
    expect(played(out)[0].volume).toBe(0);
  });
});

describe("music", () => {
  const ready = () => {
    const s = setup();
    s.sched.run();
    return { ...s, loop: s.out.loops[0] };
  };

  it("one copy however often it is kicked by gestures or volume changes", () => {
    const { A, out, loop } = ready();
    for (let i = 0; i < 5; i++) out.gestures.forEach((f) => f());
    for (const v of [0.9, 0.1, 0, 0, 0.4, 1, 0, 0.5]) A.setMusicVolume(v);
    expect(A.musicCopies()).toBe(1);
    expect(out.loops).toHaveLength(1);
    expect(loop.starts).toBeLessThanOrEqual(1 + 3); // one initial start + one resume per time it was silenced
  });

  it("volume 0 pauses, raising it resumes", () => {
    const { A, loop } = ready();
    A.setMusicVolume(0);
    expect(A.musicPlaying()).toBe(false);
    expect(loop.pauses).toBe(1);
    A.setMusicVolume(0.5);
    expect(A.musicPlaying()).toBe(true);
  });

  it("saved volume 0: the loop is built but silent until raised", () => {
    const s = setup({ storage: { "xt-mvol": "0" } });
    s.sched.run();
    expect(s.out.loops).toHaveLength(1);
    expect(s.A.musicPlaying()).toBe(false);
    s.A.setMusicVolume(0.3);
    expect(s.A.musicPlaying()).toBe(true);
  });

  it("a gesture before the music is built does nothing; the build still starts it", () => {
    const s = setup();
    s.out.gestures.forEach((f) => f());
    expect(s.A.musicPlaying()).toBe(false);
    s.sched.run();
    expect(s.A.musicPlaying()).toBe(true);
  });
});

describe("the music is a background", () => {
  it("at the default volume the loop plays quietly (under 0.12 of full scale), and never louder than the old default at the slider's top", () => {
    const { A, out, sched } = setup();
    sched.run();
    expect(out.loops[0].volume).toBeCloseTo(A.musicVolume * MUSIC_GAIN);
    expect(out.loops[0].volume).toBeLessThan(0.12);
    A.setMusicVolume(1);
    expect(out.loops[0].volume).toBeLessThan(0.5 * 0.55); // the old default
  });

  it("is quieter than the effects at their default volume", () => {
    const { A, out, sched } = setup();
    sched.run();
    A.update(0.05, false);
    A.play("build");
    A.update(0.05, false);
    const sfx = Math.max(...played(out).map((p) => p.volume));
    expect(out.loops[0].volume).toBeLessThan(sfx);
  });
});

describe("laser hum", () => {
  it("starts when beams fire, follows their count and the effects volume, stops when idle, silent on pause", () => {
    const beams = { n: 0 };
    const { A, out } = setup({ beams: () => beams.n });
    A.update(0.05, false);
    expect(out.loops).toHaveLength(0); // no beams: nothing is even built
    beams.n = 3;
    for (let i = 0; i < 40; i++) A.update(0.016, false);
    const hum = out.loops[0];
    expect(hum.opts).toMatchObject({ volume: 0, fadeEdges: true });
    expect(hum.isPlaying()).toBe(true);
    expect(hum.volume).toBeGreaterThan(0.1);
    expect(hum.volume).toBeLessThanOrEqual(0.32 * A.volume + 1e-9);
    beams.n = 0;
    for (let i = 0; i < 300; i++) A.update(0.016, false);
    expect(hum.isPlaying()).toBe(false);
    beams.n = 1;
    for (let i = 0; i < 40; i++) A.update(0.016, false);
    expect(hum.isPlaying()).toBe(true);
    A.update(0.016, true); // pause
    expect(hum.isPlaying()).toBe(false);
    expect(out.loops).toHaveLength(1); // always the same loop
  });
});

describe("with the real game", () => {
  const game = () => {
    const g = createGame({ rng: mulberry32(2) });
    g.S.credits = 1e6;
    return g;
  };

  it("what happens in the game is heard", () => {
    const g = game();
    const { A } = setup({
      beams: () => g.S.towers.reduce((n, t) => n + (t.beam ? t.beam.length : 0), 0),
    });
    g.on((e) => A.handleEvent(e));
    g.place("gun", 5, 5);
    A.update(0.016, false);
    expect(A.stats.build).toBe(1);
    g.sendWave();
    A.update(0.2, false);
    expect(A.stats.wave).toBe(1);
  });

  it("a whole game: sounds are capped, important ones get through, the end is announced", () => {
    const g = game();
    const { A, out } = setup();
    g.on((e) => A.handleEvent(e));
    for (let x = 2; x < 14; x++) g.place("gun", x, 5);
    for (let x = 2; x < 10; x++) g.place("cannon", x, 9);
    A.stats && Object.keys(A.stats).forEach((k) => delete A.stats[k]);
    g.S.lives = 1;
    g.sendWave();
    const secs = 120;
    for (let t = 0; t < secs && !g.S.over; t += 0.025) {
      g.step(0.025);
      A.update(0.025, false);
    }
    A.update(0.025, false);
    const low = ["gun", "cannon", "missile", "plasma", "boom", "pop"].reduce((n, k) => n + (A.stats[k] || 0), 0);
    expect(low).toBeGreaterThan(10);
    expect(low).toBeLessThanOrEqual(20 * secs + 2); // at most ~20 per second
    expect(A.stats.wave).toBeGreaterThan(0);
    expect(g.S.over).toBe(true);
    expect(A.stats.defeat).toBe(1);
    expect(A.stats.victory).toBeUndefined();
    expect(played(out).length).toBeGreaterThan(10);
  });
});
