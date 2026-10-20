import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { composeSong } from "../../src/audio/music/composer";
import { formatSongSpec, parseSongSpec, validateSongSpec } from "../../src/audio/music/songSpec";
import { SINISTER } from "../../src/audio/music/songs/sinister";

const clone = () => structuredClone(SINISTER);
const problems = (mutate: (s: any) => unknown) => {
  const s: any = clone();
  mutate(s);
  return validateSongSpec(s);
};

describe("the song as JSON", () => {
  it("the game's song is the file songs/sinister.json, and it is valid", () => {
    const file = JSON.parse(readFileSync("src/audio/music/songs/sinister.json", "utf8"));
    expect(SINISTER).toEqual(file);
    expect(validateSongSpec(file)).toEqual([]);
  });

  it("printing a song and reading it back gives the same song, and the printing is stable", () => {
    const text = formatSongSpec(SINISTER);
    expect(JSON.parse(text)).toEqual(SINISTER);
    expect(formatSongSpec(JSON.parse(text))).toBe(text);
    expect(readFileSync("src/audio/music/songs/sinister.json", "utf8")).toBe(text); // the file is kept in this shape
  });

  it("the notes are a bar to a line, the lines are short", () => {
    const text = formatSongSpec(SINISTER);
    expect(text).toContain("[0, 50, 0.5], [0.5, 50, 0.5], [1, 62, 0.5]");
    expect(text).toContain('"echo": { "instrument": "leadEcho"');
    expect(Math.max(...text.split("\n").map((l) => l.length))).toBeLessThanOrEqual(110);
  });

  it("a valid song composes; an empty track is fine", () => {
    expect(composeSong(parseSongSpec(clone())).bars).toBe(16);
    const empty = { bpm: 90, beatsPerBar: 4, bars: 2, tracks: [{ name: "x", instrument: "bass", vol: 0.3, notes: [] }] };
    expect(validateSongSpec(empty)).toEqual([]);
    expect(JSON.parse(formatSongSpec(empty))).toEqual(empty);
  });
});

describe("what makes a song valid", () => {
  it("is an object with a tempo, a bar length and a number of bars", () => {
    expect(validateSongSpec(null)).toEqual(["song: expected an object"]);
    expect(problems((s) => (s.bpm = 0))[0]).toMatch(/bpm: must be between/);
    expect(problems((s) => (s.beatsPerBar = 3.5))[0]).toMatch(/beatsPerBar: must be a whole number/);
    expect(problems((s) => (s.bars = 0))[0]).toMatch(/bars: must be between 1 and 128/);
    expect(problems((s) => (s.tracks = []))[0]).toMatch(/tracks: needs at least one track/);
  });

  it("tracks have unique names, a known instrument and loudness in range", () => {
    expect(problems((s) => (s.tracks[1].name = "bass"))[0]).toMatch(/tracks\[1\]\.name: the name "bass" is used twice/);
    expect(problems((s) => (s.tracks[0].instrument = "kazoo"))[0]).toMatch(/tracks\[0\]\.instrument: unknown instrument "kazoo"/);
    expect(problems((s) => (s.tracks[0].vol = 2))[0]).toMatch(/tracks\[0\]\.vol: must be between 0 and 1/);
    expect(problems((s) => (s.tracks[6].echo.delaySeconds = 9))[0]).toMatch(/echo\.delaySeconds/);
    expect(problems((s) => (s.tracks[6].echo.instrument = "x"))[0]).toMatch(/echo\.instrument: unknown instrument/);
  });

  it("notes lie inside the song and have a sensible pitch, length and velocity", () => {
    expect(problems((s) => (s.tracks[0].notes[0] = [64, 50, 1]))[0]).toMatch(/notes\[0\]\[0\]: must be between 0 and/);
    expect(problems((s) => (s.tracks[0].notes[0] = [63.5, 50, 1]))[0]).toMatch(/the note ends at beat 64.5/);
    expect(problems((s) => (s.tracks[0].notes[0] = [0, 130, 1]))[0]).toMatch(/notes\[0\]\[1\]: must be between 0 and 127/);
    expect(problems((s) => (s.tracks[0].notes[0] = [0, 50.5, 1]))[0]).toMatch(/notes\[0\]\[1\]: must be a whole number/);
    expect(problems((s) => (s.tracks[0].notes[0] = [0, 50, 0]))[0]).toMatch(/notes\[0\]\[2\]: must be between 0.0625/);
    expect(problems((s) => (s.tracks[0].notes[0] = [0, 50, 1, 2]))[0]).toMatch(/notes\[0\]\[3\]: must be between 0 and 1/);
    expect(problems((s) => (s.tracks[0].notes[0] = [0, 50]))[0]).toMatch(/notes\[0\]: expected \[beat, pitch, beats\]/);
  });

  it("drums ignore pitch and length but still sit inside the song", () => {
    expect(problems((s) => (s.tracks[3].notes[0] = [0, 0, 0]))).toEqual([]);
    expect(problems((s) => (s.tracks[3].notes[0] = [99, 0, 0]))[0]).toMatch(/tracks\[3\]\.notes\[0\]\[0\]/);
  });

  it("the instruments are the caller's choice", () => {
    expect(validateSongSpec(clone(), { instruments: { bass: { kind: "tone" } } }).length).toBeGreaterThan(0);
  });

  it("parseSongSpec lists every problem with its path", () => {
    const s: any = clone();
    s.bpm = -1;
    s.tracks[0].vol = 5;
    expect(() => parseSongSpec(s)).toThrow(/bpm:[\s\S]*tracks\[0\]\.vol/);
  });
});
