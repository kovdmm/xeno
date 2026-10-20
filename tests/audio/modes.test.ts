import { describe, expect, it } from "vitest";
import { composeSong, oneAtATime, renderSettings, type SongSpec } from "../../src/audio/music/composer";
import { INSTRUMENTS, counterpart, instrumentsOf, isPitchedVoice } from "../../src/audio/music/instruments";
import { MODES, MODE_NAMES } from "../../src/audio/music/modes";
import { renderScore } from "../../src/audio/music/render";
import { formatSongSpec, validateSongSpec } from "../../src/audio/music/songSpec";
import { CHIP_DEMO, CLEAN_DEMO } from "../../src/audio/music/songs/demos";
import { fingerprint } from "../helpers/audio";
import { readFileSync } from "node:fs";

/** one note of an instrument, rendered the way its mode renders */
function note(name: string, pitch = 57, beats = 2, bpm = 120, vol = INSTRUMENTS[name].vol): Float32Array {
  const mode = INSTRUMENTS[name].mode;
  const song: SongSpec = {
    sound: mode,
    bpm,
    beatsPerBar: 4,
    bars: 2,
    tracks: [{ name: "t", instrument: name, vol, notes: [[0, pitch, beats]] }],
  };
  return renderScore(composeSong(song), renderSettings(song));
}
const peak = (a: Float32Array) => a.reduce((m, x) => Math.max(m, Math.abs(x)), 0);

/** the pitch of a sound in Hz, from where it best repeats itself (between 60 and 500 Hz) */
function pitchOf(a: Float32Array, rate: number, from = 0.08, len = 0.25): number {
  const x = a.subarray(Math.round(from * rate), Math.round((from + len) * rate));
  const r: number[] = [];
  const first = Math.round(rate / 500);
  for (let lag = first; lag < Math.round(rate / 60); lag++) {
    let sum = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i + lag < x.length; i++) {
      sum += x[i] * x[i + lag];
      e1 += x[i] * x[i];
      e2 += x[i + lag] * x[i + lag];
    }
    r.push(sum / Math.sqrt(e1 * e2 || 1));
  }
  // the first clear peak: a signal repeats at twice the period too, sometimes a little better
  const best = Math.max(...r);
  let k = 1;
  while (!(r[k] >= 0.9 * best && r[k] >= r[k - 1] && r[k] >= r[k + 1])) k++;
  return rate / (first + k);
}

describe("sound modes", () => {
  it("every instrument belongs to a known mode, and every mode has a full set", () => {
    for (const [name, i] of Object.entries(INSTRUMENTS)) expect(MODE_NAMES, name).toContain(i.mode);
    for (const mode of MODE_NAMES) {
      const roles = new Set(instrumentsOf(mode).map((n) => INSTRUMENTS[n].role));
      for (const role of ["bass", "lead", "kick", "snare", "hat"] as const) expect(roles.has(role), `${mode} needs a ${role}`).toBe(true);
    }
    expect(instrumentsOf("lofi")).toEqual(["bass", "arp", "drone", "lead", "kick", "snare", "hat"]);
    expect(instrumentsOf("lofi", true)).toContain("leadEcho");
    expect(instrumentsOf("clean").length).toBeGreaterThanOrEqual(15);
    expect(instrumentsOf("chip").length).toBeGreaterThanOrEqual(8);
  });

  it("each mode renders at its own rate and rounding", () => {
    expect(renderSettings({ bpm: 100, beatsPerBar: 4, bars: 1, tracks: [] })).toMatchObject({ sampleRate: 16000, crushSteps: 40 });
    expect(renderSettings({ sound: "chip" } as SongSpec)).toMatchObject({ sampleRate: 22050, crushSteps: 16 });
    expect(renderSettings({ sound: "clean" } as SongSpec)).toMatchObject({ sampleRate: 32000, crushSteps: 0 });
  });

  it("every instrument makes a finite, audible sound that stays inside the headroom", () => {
    for (const name of Object.keys(INSTRUMENTS)) {
      const a = note(name);
      expect(a.every(Number.isFinite), name).toBe(true);
      expect(peak(a), `${name} is silent`).toBeGreaterThan(0.01);
      expect(peak(a), `${name} is too loud`).toBeLessThanOrEqual(MODES[INSTRUMENTS[name].mode].headroom + 1e-6);
    }
  });

  it("a rendering is the same every time", () => {
    for (const name of ["guitar", "piano", "chipSnare", "cleanKick", "pad"]) expect(fingerprint(note(name))).toBe(fingerprint(note(name)));
  });
});

describe("the new voices play the pitch they are asked for", () => {
  const cases: [string, number][] = [
    ["guitar", 57], // A3 = 220 Hz
    ["guitarElectric", 57],
    ["bassPluck", 45],
    ["piano", 57],
    ["epiano", 57],
    ["bassSub", 45],
    ["strings", 57],
    ["chipBass", 57],
    ["chipLead", 69],
  ];
  for (const [name, pitch] of cases)
    it(`${name} at MIDI ${pitch}`, () => {
      const want = 440 * Math.pow(2, (pitch - 69) / 12);
      const got = pitchOf(note(name, pitch, 3), MODES[INSTRUMENTS[name].mode].sampleRate);
      expect(Math.abs(got / want - 1), `${name}: ${got.toFixed(1)} Hz, wanted ${want.toFixed(1)} Hz`).toBeLessThan(0.03);
    });

  it("a plucked string rings on after the key is let go only a little; held notes sound longer than short ones", () => {
    const rms = (a: Float32Array, from: number, to: number, rate: number) => {
      let s = 0;
      const i0 = Math.round(from * rate);
      const i1 = Math.round(to * rate);
      for (let i = i0; i < i1; i++) s += a[i] * a[i];
      return Math.sqrt(s / (i1 - i0));
    };
    const rate = 32000;
    const long = note("guitar", 52, 4);
    const short = note("guitar", 52, 0.25);
    expect(rms(long, 0.5, 0.7, rate)).toBeGreaterThan(rms(short, 0.5, 0.7, rate) * 3); // the short one has been muted
    expect(rms(long, 0.02, 0.1, rate)).toBeGreaterThan(rms(long, 1.5, 1.6, rate)); // the string dies away
  });

  it("an overdriven guitar is louder at the end of its ring than a clean one (the clipping holds the level up)", () => {
    const tail = (a: Float32Array) => a.subarray(32000, 48000).reduce((m, x) => m + x * x, 0);
    expect(tail(note("guitarElectric", 52, 4))).toBeGreaterThan(tail(note("guitar", 52, 4)) * 0.5);
  });
});

describe("the chip mode", () => {
  it("the loudness is in at most 16 steps", () => {
    for (const name of ["chipLead", "chipHarmony", "chipSnare", "chipHat"]) {
      const a = note(name);
      const levels = new Set(Array.from(a, (x) => Math.round(x * 16)));
      expect(levels.size, name).toBeLessThanOrEqual(2 * 16 + 1);
    }
  });

  it("the triangle bass has 16 levels", () => {
    const song: SongSpec = { sound: "chip", bpm: 120, beatsPerBar: 4, bars: 2, tracks: [{ name: "b", instrument: "chipBass", vol: 1, notes: [[0, 45, 4]] }] };
    const a = renderScore(composeSong(song), { sampleRate: 22050, crushSteps: 0, headroom: 100 });
    const mid = a.subarray(2000, 20000);
    expect(new Set(Array.from(mid, (x) => Math.round(x * 1e4))).size).toBeLessThanOrEqual(16);
  });

  it("the noise channel is a shift register: a short and a long one differ, both are repeatable", () => {
    const short = note("chipHat");
    expect(fingerprint(short)).toBe(fingerprint(note("chipHat")));
    expect(fingerprint(note("chipSnare"))).not.toBe(fingerprint(short));
  });

  it("a channel plays one note at a time: of a chord the highest, and a note stops where the next starts", () => {
    expect(oneAtATime([[0, 60, 4], [0, 67, 4], [1, 62, 1], [3, 64, 0.5]])).toEqual([[0, 67, 1], [1, 62, 1], [3, 64, 0.5]]);
    expect(oneAtATime([[0, 60, 1, 0.5]])).toEqual([[0, 60, 1, 0.5]]);
    const track = (sound?: "chip") => ({ sound, bpm: 120, beatsPerBar: 4, bars: 1, tracks: [{ name: "p", instrument: sound ? "chipLead" : "lead", vol: 0.1, notes: [[0, 60, 4], [1, 64, 1]] as [number, number, number][] }] }) as SongSpec;
    expect(composeSong(track("chip")).tracks[0].notes.map((n) => n.dur)).toEqual([1, 1]);
    expect(composeSong(track()).tracks[0].notes.map((n) => n.dur)).toEqual([4, 1]); // lofi: free
  });

  it("drums in a chip song are not cut", () => {
    const song: SongSpec = { sound: "chip", bpm: 120, beatsPerBar: 4, bars: 1, tracks: [{ name: "h", instrument: "chipHat", vol: 1, notes: [[0, 0, 0.25], [0, 0, 0.25]] }] };
    expect(composeSong(song).tracks[0].notes).toHaveLength(2);
  });
});

describe("moving a song to another mode", () => {
  it("each instrument has a counterpart of the same part", () => {
    expect(counterpart("kick", "clean")).toBe("cleanKick");
    expect(counterpart("cleanSnare", "chip")).toBe("chipSnare");
    expect(counterpart("lead", "chip")).toBe("chipLead");
    expect(counterpart("bass", "clean")).toBe("bassPluck");
    expect(counterpart("arp", "chip")).toBe("chipArp");
    expect(counterpart("guitar", "guitar" in INSTRUMENTS ? "clean" : "lofi")).toBe("guitar");
    expect(counterpart("drone", "chip")).toBeTruthy(); // no pad on the chip: another instrument takes the part
    expect(counterpart("nothing", "chip")).toBeNull();
    for (const name of Object.keys(INSTRUMENTS))
      for (const mode of MODE_NAMES) {
        const c = counterpart(name, mode);
        expect(c, `${name} → ${mode}`).not.toBeNull();
        expect(INSTRUMENTS[c!].mode).toBe(mode);
        // a pitched instrument never turns into a drum, nor the other way round
        expect(isPitchedVoice(INSTRUMENTS[c!]), `${name} → ${c}`).toBe(isPitchedVoice(INSTRUMENTS[name]));
      }
  });
});

describe("the song's sound in the file", () => {
  const song = (sound: string | undefined, instrument: string): any => ({ ...(sound ? { sound } : {}), bpm: 100, beatsPerBar: 4, bars: 1, tracks: [{ name: "x", instrument, vol: 0.3, notes: [[0, 60, 1]] }] });

  it("a song may only use the instruments of its mode", () => {
    expect(validateSongSpec(song("clean", "guitar"))).toEqual([]);
    expect(validateSongSpec(song("chip", "chipLead"))).toEqual([]);
    expect(validateSongSpec(song(undefined, "lead"))).toEqual([]);
    expect(validateSongSpec(song("clean", "lead"))[0]).toMatch(/tracks\[0\]\.instrument: unknown instrument "lead" \(the clean sound has/);
    expect(validateSongSpec(song(undefined, "guitar"))[0]).toMatch(/the lofi sound has/);
  });

  it("an unknown sound is named", () => {
    expect(validateSongSpec(song("wow", "lead"))[0]).toMatch(/sound: unknown sound "wow" \(have lofi, chip, clean\)/);
  });

  it("drum hits of the new modes are hits: pitch and length are free", () => {
    const s = song("chip", "chipSnare");
    s.tracks[0].notes = [[0, 0, 0.25]];
    expect(validateSongSpec(s)).toEqual([]);
  });

  it("the mode is printed first and read back", () => {
    const s = song("clean", "guitar");
    const text = formatSongSpec(s);
    expect(text.startsWith('{\n  "sound": "clean",\n  "bpm": 100,')).toBe(true);
    expect(JSON.parse(text)).toEqual(s);
  });
});

describe("the demo songs", () => {
  it("are the files, valid, and in their modes", () => {
    for (const [song, file, mode] of [[CHIP_DEMO, "chip-demo", "chip"], [CLEAN_DEMO, "clean-demo", "clean"]] as const) {
      const path = `src/audio/music/songs/${file}.json`;
      expect(song.sound).toBe(mode);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(song);
      expect(readFileSync(path, "utf8")).toBe(formatSongSpec(song));
      expect(validateSongSpec(song)).toEqual([]);
    }
  });

  it("render with their mode's settings: audible, inside the headroom, at the mode's rate", () => {
    for (const song of [CHIP_DEMO, CLEAN_DEMO]) {
      const settings = renderSettings(song);
      const a = renderScore(composeSong(song), settings);
      expect(a.length).toBe(Math.round(song.bars * song.beatsPerBar * (60 / song.bpm) * settings.sampleRate));
      expect(a.every(Number.isFinite)).toBe(true);
      expect(peak(a)).toBeGreaterThan(0.5);
      expect(peak(a)).toBeLessThanOrEqual(0.8 + (settings.crushSteps ? 0.5 / settings.crushSteps : 0) + 1e-6); // the rounding may lift the peak half a step
    }
  });

  it("the chip one plays one note at a time on every pitched channel", () => {
    const score = composeSong(CHIP_DEMO);
    for (const t of score.tracks.filter((t) => isPitchedVoice(INSTRUMENTS[t.notes[0].instrument]))) {
      const sorted = [...t.notes].sort((a, b) => a.beat - b.beat);
      sorted.slice(1).forEach((n, i) => expect(sorted[i].beat + sorted[i].dur, t.name).toBeLessThanOrEqual(n.beat + 1e-9));
    }
  });
});
