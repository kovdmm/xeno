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

  it("short things stay on one line, long ones are indented", () => {
    const text = formatSongSpec(SINISTER);
    expect(text).toContain('"D": { "bass": 38, "arp": 62, "minor": true }');
    expect(text).toContain("[[74, 2], [77, 1], [76, 1]],"); // one bar of the lead per line
    expect(Math.max(...text.split("\n").map((l) => l.length))).toBeLessThanOrEqual(110);
  });

  it("a valid description composes", () => {
    expect(composeSong(parseSongSpec(clone())).bars).toBe(16);
  });
});

describe("what makes a song valid", () => {
  it("is an object with a tempo and a bar length", () => {
    expect(validateSongSpec(null)).toEqual(["song: expected an object"]);
    expect(problems((s) => (s.bpm = 0))[0]).toMatch(/bpm: must be between/);
    expect(problems((s) => (s.beatsPerBar = 3.5))[0]).toMatch(/beatsPerBar: must be a whole number/);
  });

  it("chords are named, in MIDI range, and the progression only uses known ones", () => {
    expect(problems((s) => (s.chords.D.bass = 200))[0]).toMatch(/chords\.D\.bass: must be between 0 and 127/);
    expect(problems((s) => (s.chords.D.minor = "yes"))[0]).toMatch(/chords\.D\.minor: expected true or false/);
    expect(problems((s) => (s.progression[3] = "H"))[0]).toMatch(/progression\[3\]: unknown chord "H"/);
    expect(problems((s) => (s.progression = []))[0]).toMatch(/progression: needs at least one bar/);
    expect(problems((s) => (s.chords = {}))[0]).toMatch(/chords: needs at least one chord/);
  });

  it("the bass has to fit its bar, the arpeggio has to divide it", () => {
    expect(problems((s) => s.bass.steps.push(0, 0))[0]).toMatch(/bass\.steps: 10 steps of 0\.5 beats do not fit/);
    expect(problems((s) => (s.arp.stepBeats = 0.3))[0]).toMatch(/arp\.stepBeats: must divide the bar/);
    expect(problems((s) => (s.bass.vol = 2))[0]).toMatch(/bass\.vol: must be between 0 and 1/);
  });

  it("drums name known instruments and hit inside the bar", () => {
    expect(problems((s) => (s.drums[0].instrument = "cowbell"))[0]).toMatch(/drums\[0\]\.instrument: unknown drum "cowbell"/);
    expect(problems((s) => (s.drums[0].beats = [4]))[0]).toMatch(/drums\[0\]\.beats\[0\]: must be between/);
    expect(problems((s) => (s.fills[0].bar = 16))[0]).toMatch(/fills\[0\]\.bar: must be between 0 and 15/);
    expect(problems((s) => (s.fills[0].hits[0] = ["tom", 1]))[0]).toMatch(/unknown drum "tom"/);
    expect(validateSongSpec(clone(), { drumInstruments: ["kick"] }).length).toBeGreaterThan(0); // the list is the caller's
  });

  it("the lead has one line per bar from fromBar, and each line fills its bar exactly", () => {
    expect(problems((s) => s.lead.lines.pop())[0]).toMatch(/lead\.lines: needs one line per bar from bar 4 \(12\), has 11/);
    expect(problems((s) => (s.lead.lines[0][0][1] = 1))[0]).toMatch(/lead\.lines\[0\]: the notes last 3 beats, the bar has 4/);
    expect(problems((s) => (s.lead.lines[1] = []))[0]).toMatch(/lead\.lines\[1\]: needs at least one note/);
    expect(problems((s) => (s.lead.lines[2][0][0] = 130))[0]).toMatch(/lead\.lines\[2\]\[0\]\[0\]/);
    // a quarter and two eighths and a quarter and a half... any split that sums to the bar is fine
    expect(problems((s) => (s.lead.lines[0] = [[74, 0.5], [75, 0.5], [76, 1], [77, 2]]))).toEqual([]);
  });

  it("a lead that starts later needs fewer lines", () => {
    expect(problems((s) => ((s.lead.fromBar = 6), (s.lead.lines = s.lead.lines.slice(2))))).toEqual([]);
  });

  it("parseSongSpec lists every problem with its path", () => {
    const s: any = clone();
    s.bpm = -1;
    s.progression[0] = "Q";
    expect(() => parseSongSpec(s)).toThrow(/bpm:[\s\S]*progression\[0\]/);
  });
});
