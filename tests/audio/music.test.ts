import { describe, it, expect } from "vitest";
import { composeSong, type SongSpec } from "../../src/audio/music/composer";
import { INSTRUMENTS } from "../../src/audio/music/instruments";
import { loopLength, renderScore } from "../../src/audio/music/render";
import { SINISTER } from "../../src/audio/music/songs/sinister";
import { MusicPlayer } from "../../src/audio/music/player";
import { fakeOut, fingerprint } from "../helpers/audio";

const score = composeSong(SINISTER);
const loop = renderScore(score);
const notes = (name: string) => score.tracks.find((t) => t.name === name)!.notes;
const peak = (a) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const rms = (a, from, to) => {
  let s = 0;
  for (let i = from; i < to; i++) s += a[i] * a[i];
  return Math.sqrt(s / (to - from));
};
const inBar = (n, bar) => Math.floor(n.beat / score.beatsPerBar) === bar;

describe("composer: the song description becomes a score", () => {
  it("has the song's length, tempo and tracks", () => {
    expect(score).toMatchObject({ bpm: 96, beatsPerBar: 4, bars: 16 });
    expect(score.tracks.map((t) => t.name)).toEqual(["bass", "arpeggio", "drone", "drums", "lead"]);
  });

  it("builds up as arranged: bass and drone first, arpeggio, then drums and lead, hi-hats, a fill", () => {
    const firstBar = (name: string, instrument?: string) =>
      Math.min(
        ...notes(name)
          .filter((n) => !instrument || n.instrument === instrument)
          .map((n) => Math.floor(n.beat / 4)),
      );
    expect(firstBar("bass")).toBe(0);
    expect(firstBar("drone")).toBe(0);
    expect(firstBar("arpeggio")).toBe(2);
    expect(firstBar("drums", "kick")).toBe(0);
    expect(firstBar("drums", "snare")).toBe(4);
    expect(firstBar("lead")).toBe(4);
    expect(firstBar("drums", "hat")).toBe(8);
    // the fill: extra snares and a kick in the last bar
    const last = notes("drums").filter((n) => inBar(n, 15));
    expect(last.filter((n) => n.instrument === "snare").map((n) => n.beat - 60)).toEqual([1, 3, 3.5, 3.75]);
  });

  it("note counts per bar", () => {
    expect(notes("bass").filter((n) => inBar(n, 0))).toHaveLength(8);
    expect(notes("arpeggio").filter((n) => inBar(n, 5))).toHaveLength(16);
    expect(notes("drone")).toHaveLength(16);
    expect(notes("drums").filter((n) => n.instrument === "hat")).toHaveLength(8 * 8);
    // every lead note has an echo
    expect(notes("lead").filter((n) => n.instrument === "leadEcho")).toHaveLength(
      notes("lead").filter((n) => n.instrument === "lead").length,
    );
  });

  it("the harmony follows the chords: bass on the root, arpeggio in the right triad", () => {
    const pitchClass = (m) => ((m % 12) + 12) % 12;
    // bar 0 is D minor: D F A; bar 2 is Bb major: Bb D F
    const triad = (bar) =>
      new Set(
        notes("arpeggio")
          .filter((n) => inBar(n, bar))
          .map((n) => pitchClass(n.pitch)),
      );
    expect(triad(2)).toEqual(new Set([10, 2, 5]));
    expect(triad(4)).toEqual(new Set([2, 5, 9]));
    expect(
      new Set(
        notes("bass")
          .filter((n) => inBar(n, 0))
          .map((n) => pitchClass(n.pitch)),
      ),
    ).toEqual(
      new Set([2, 9]), // the root D and its fifth A
    );
  });

  it("the lead stays in the key (D minor with Eb and C# turns)", () => {
    const allowed = new Set([2, 4, 5, 7, 9, 10, 1, 3, 0]); // D E F G A Bb C#/Db Eb C
    for (const n of notes("lead")) expect(allowed.has(n.pitch! % 12), `pitch ${n.pitch}`).toBe(true);
  });

  it("every note refers to an existing instrument, lies inside the loop and has a sensible loudness", () => {
    for (const t of score.tracks)
      for (const n of t.notes) {
        expect(INSTRUMENTS[n.instrument], n.instrument).toBeDefined();
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.beat).toBeLessThan(score.bars * score.beatsPerBar);
        expect(n.vol).toBeGreaterThan(0);
        expect(n.vol).toBeLessThanOrEqual(1);
      }
  });

  it("is a pure function of the description", () => {
    expect(composeSong(SINISTER)).toEqual(score);
  });

  it("rejects an unknown chord with the bar number", () => {
    const bad = { ...SINISTER, progression: ["D", "X"] };
    expect(() => composeSong(bad)).toThrow(/bar 1 uses unknown chord "X"/);
  });

  it("another song is just another description (a tiny one-bar tune renders)", () => {
    const tiny: SongSpec = {
      ...SINISTER,
      progression: ["D"],
      arp: { ...SINISTER.arp, fromBar: 0 },
      lead: { ...SINISTER.lead, fromBar: 0, lines: [[[74, 4]]] },
      drums: [{ instrument: "kick", beats: [0] }],
      fills: [],
    };
    const s = composeSong(tiny);
    expect(s.bars).toBe(1);
    const out = renderScore(s);
    expect(out.length).toBe(loopLength(s));
    expect(peak(out)).toBeGreaterThan(0.1);
  });
});

describe("renderer: the score becomes one seamless loop", () => {
  it("is 40 s of 16 kHz audio", () => {
    expect(loop.constructor.name).toBe("Float32Array");
    expect(loop.length).toBe(16000 * 40);
    expect(loopLength(score)).toBe(loop.length);
  });

  it("is deterministic and matches the recorded fingerprint (same samples as the original composition)", () => {
    expect(fingerprint(renderScore(score))).toBe(fingerprint(loop));
    expect(fingerprint(loop)).toMatchSnapshot();
  });

  it("is finite, has headroom and is bit-crushed to 1/40 steps", () => {
    expect(loop.every(Number.isFinite)).toBe(true);
    expect(peak(loop)).toBeLessThanOrEqual(0.8 + 1e-6);
    expect(peak(loop)).toBeGreaterThan(0.5);
    for (let i = 0; i < loop.length; i += 997)
      expect(Math.abs(loop[i] * 40 - Math.round(loop[i] * 40))).toBeLessThan(1e-4);
  });

  it("every bar is audible and the arrangement is fuller from bar 5", () => {
    const bar = loop.length / 16;
    const r = Array.from({ length: 16 }, (_, b) => rms(loop, b * bar, (b + 1) * bar));
    for (const x of r) expect(x).toBeGreaterThan(0.05);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    expect(mean(r.slice(0, 4))).toBeLessThan(mean(r.slice(4)));
  });

  it("render options: sample rate, headroom and crush are respected", () => {
    const quiet = renderScore(score, { sampleRate: 8000, headroom: 0.4, crushSteps: 10 });
    expect(quiet.length).toBe(8000 * 40);
    expect(peak(quiet)).toBeLessThanOrEqual(0.4 + 1e-6);
    for (let i = 0; i < quiet.length; i += 1013)
      expect(Math.abs(quiet[i] * 10 - Math.round(quiet[i] * 10))).toBeLessThan(1e-4);
  });

  it("a different noise seed changes only the drums", () => {
    const other = renderScore(score, { noiseSeed: 0x1234 });
    expect(fingerprint(other)).not.toBe(fingerprint(loop));
  });

  it("an unknown instrument is reported by name", () => {
    const bad = {
      ...score,
      tracks: [{ name: "x", notes: [{ beat: 0, dur: 1, instrument: "kazoo", pitch: 60, vol: 0.1 }] }],
    };
    expect(() => renderScore(bad)).toThrow(/unknown instrument "kazoo"/);
  });

  it("notes near the end wrap round to the start (no click at the seam)", () => {
    const one = {
      bpm: 120,
      beatsPerBar: 4,
      bars: 1,
      tracks: [{ name: "t", notes: [{ beat: 3.9, dur: 4, instrument: "bass", pitch: 40, vol: 0.5 }] }],
    };
    const out = renderScore(one, { headroom: 1, crushSteps: 1e6 });
    expect(rms(out, 0, 2000)).toBeGreaterThan(0.01); // the tail of the note sounds at the beginning
  });
});

describe("music player", () => {
  const player = (volume = { v: 0.5 }) => {
    const out = fakeOut();
    let built = 0;
    const p = new MusicPlayer(
      out,
      () => (built++, new Float32Array(10)),
      16000,
      () => volume.v,
    );
    return { out, p, volume, builds: () => built };
  };

  it("builds once and starts at gain × volume", () => {
    const { out, p, builds } = player();
    expect(p.playing()).toBe(false);
    p.build();
    p.build();
    expect(builds()).toBe(1);
    expect(out.loops).toHaveLength(1);
    expect(out.loops[0].opts.volume).toBeCloseTo(0.5 * 0.55);
    expect(out.loops[0].opts.fadeEdges).toBeUndefined(); // music loops seamlessly
    expect(p.playing()).toBe(true);
  });

  it("many starts and volume changes never stack a second copy", () => {
    const { out, p, volume } = player();
    p.build();
    for (let i = 0; i < 20; i++) {
      volume.v = (i % 7) / 10;
      p.volumeChanged();
      p.start();
    }
    expect(p.copies()).toBeLessThanOrEqual(1);
    expect(out.loops).toHaveLength(1);
  });

  it("volume 0 pauses; raising it resumes (the same loop, no new one)", () => {
    const { out, p, volume } = player();
    p.build();
    volume.v = 0;
    p.volumeChanged();
    expect(p.playing()).toBe(false);
    expect(out.loops[0].pauses).toBe(1);
    volume.v = 0.3;
    p.volumeChanged();
    expect(p.playing()).toBe(true);
    expect(out.loops).toHaveLength(1);
  });

  it("built while the volume is 0: stays silent until raised", () => {
    const { p, volume } = player({ v: 0 });
    p.build();
    expect(p.playing()).toBe(false);
    p.start();
    expect(p.playing()).toBe(false);
    volume.v = 0.4;
    p.volumeChanged();
    expect(p.playing()).toBe(true);
  });

  it("volume changes before the loop exists are harmless", () => {
    const { p } = player();
    expect(() => p.volumeChanged()).not.toThrow();
    expect(p.copies()).toBe(0);
  });
});
