// A song is data: a SongSpec written as JSON (see songs/). This module checks such a document and prints it in a
// readable shape, so tools (the music editor next to this project) and the game agree on what a song is.
// The composer turns a valid SongSpec into a score; nothing here knows about sound.
import type { SongSpec } from "./composer";

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
/** beats are compared with a little slack: 0.1 + 0.2 + 0.7 is a whole beat too */
const EPS = 1e-6;

export interface ValidateOptions {
  /** the instruments drum patterns may name (default: kick, snare, hat) */
  drumInstruments?: readonly string[];
}

/** Lists everything wrong with a song description; an empty list means the composer can use it. */
export function validateSongSpec(data: unknown, opts: ValidateOptions = {}): string[] {
  const errs: string[] = [];
  const bad = (path: string, why: string) => errs.push(`${path}: ${why}`);
  const drumNames = opts.drumInstruments ?? ["kick", "snare", "hat"];
  const num = (path: string, v: unknown, min: number, max = Infinity, int = false) => {
    if (!isNum(v)) return bad(path, `expected a number, got ${JSON.stringify(v)}`);
    if (v < min || v > max) return bad(path, `must be between ${min} and ${max}, got ${v}`);
    if (int && !isInt(v)) bad(path, `must be a whole number, got ${v}`);
  };
  const midi = (path: string, v: unknown) => num(path, v, 0, 127, true);
  const level = (path: string, v: unknown) => num(path, v, 0, 1);

  if (!isObj(data)) return ["song: expected an object"];
  const s = data;
  num("bpm", s.bpm, 20, 400);
  num("beatsPerBar", s.beatsPerBar, 1, 16, true);

  // chords and the progression (the length of the song)
  const chords = isObj(s.chords) ? s.chords : (bad("chords", "expected an object of chords"), {});
  if (isObj(s.chords) && !Object.keys(chords).length) bad("chords", "needs at least one chord");
  for (const [name, c] of Object.entries<any>(chords)) {
    if (!isObj(c)) {
      bad(`chords.${name}`, "expected { bass, arp, minor }");
      continue;
    }
    midi(`chords.${name}.bass`, c.bass);
    midi(`chords.${name}.arp`, c.arp);
    if (typeof c.minor !== "boolean") bad(`chords.${name}.minor`, "expected true or false");
  }
  let bars = 0;
  if (!Array.isArray(s.progression) || !s.progression.length) bad("progression", "needs at least one bar");
  else {
    bars = s.progression.length;
    s.progression.forEach((name: unknown, i: number) => {
      if (typeof name !== "string" || !(name in chords)) bad(`progression[${i}]`, `unknown chord ${JSON.stringify(name)}`);
    });
  }
  const bpb = isNum(s.beatsPerBar) ? s.beatsPerBar : 4;

  // bass
  if (isObj(s.bass)) {
    const b = s.bass;
    if (!Array.isArray(b.steps) || !b.steps.length) bad("bass.steps", "needs at least one step");
    else b.steps.forEach((x: unknown, i: number) => num(`bass.steps[${i}]`, x, -48, 48, true));
    num("bass.stepBeats", b.stepBeats, 0.0625, 16);
    if (Array.isArray(b.steps) && isNum(b.stepBeats) && b.steps.length * b.stepBeats > bpb + EPS)
      bad("bass.steps", `${b.steps.length} steps of ${b.stepBeats} beats do not fit in a bar of ${bpb} beats`);
    num("bass.octave", b.octave, -48, 48, true);
    level("bass.vol", b.vol);
    level("bass.gate", b.gate);
  } else bad("bass", "expected an object");

  // arpeggio
  if (isObj(s.arp)) {
    const a = s.arp;
    num("arp.fromBar", a.fromBar, 0, undefined, true);
    num("arp.stepBeats", a.stepBeats, 0.0625, 16);
    if (isNum(a.stepBeats) && Math.abs(bpb / a.stepBeats - Math.round(bpb / a.stepBeats)) > EPS)
      bad("arp.stepBeats", `must divide the bar (${bpb} beats) into whole steps`);
    level("arp.gate", a.gate);
    level("arp.vol", a.vol);
    level("arp.louderVol", a.louderVol);
    num("arp.louderFromBar", a.louderFromBar, 0, undefined, true);
    num("arp.liftSemitones", a.liftSemitones, -48, 48, true);
  } else bad("arp", "expected an object");

  // drone
  if (isObj(s.drone)) {
    num("drone.octave", s.drone.octave, -48, 96, true);
    level("drone.vol", s.drone.vol);
    level("drone.gate", s.drone.gate);
  } else bad("drone", "expected an object");

  // drums and fills
  const hit = (path: string, beat: unknown) => num(path, beat, 0, bpb - EPS);
  if (!Array.isArray(s.drums)) bad("drums", "expected a list of patterns");
  else
    s.drums.forEach((d: any, i: number) => {
      const p = `drums[${i}]`;
      if (!isObj(d)) return bad(p, "expected { instrument, beats }");
      if (!drumNames.includes(d.instrument)) bad(`${p}.instrument`, `unknown drum ${JSON.stringify(d.instrument)} (have ${drumNames.join(", ")})`);
      if (!Array.isArray(d.beats)) bad(`${p}.beats`, "expected a list of beats");
      else d.beats.forEach((b: unknown, k: number) => hit(`${p}.beats[${k}]`, b));
      if (d.fromBar !== undefined) num(`${p}.fromBar`, d.fromBar, 0, undefined, true);
    });
  if (!Array.isArray(s.fills)) bad("fills", "expected a list of fills");
  else
    s.fills.forEach((f: any, i: number) => {
      const p = `fills[${i}]`;
      if (!isObj(f)) return bad(p, "expected { bar, hits }");
      num(`${p}.bar`, f.bar, 0, Math.max(0, bars - 1), true);
      if (!Array.isArray(f.hits)) bad(`${p}.hits`, "expected a list of [instrument, beat]");
      else
        f.hits.forEach((h: unknown, k: number) => {
          if (!Array.isArray(h) || h.length !== 2) return bad(`${p}.hits[${k}]`, "expected [instrument, beat]");
          if (!drumNames.includes(h[0])) bad(`${p}.hits[${k}][0]`, `unknown drum ${JSON.stringify(h[0])}`);
          hit(`${p}.hits[${k}][1]`, h[1]);
        });
    });

  // lead: one line of [pitch, beats] per bar from `fromBar`, filling the bar exactly
  if (isObj(s.lead)) {
    const l = s.lead;
    num("lead.fromBar", l.fromBar, 0, bars, true);
    level("lead.vol", l.vol);
    level("lead.gate", l.gate);
    if (isObj(l.echo)) {
      num("lead.echo.delaySeconds", l.echo.delaySeconds, 0, 5);
      level("lead.echo.vol", l.echo.vol);
      level("lead.echo.gate", l.echo.gate);
    } else bad("lead.echo", "expected { delaySeconds, vol, gate }");
    if (!Array.isArray(l.lines)) bad("lead.lines", "expected a list of bars");
    else {
      const want = isInt(l.fromBar) ? Math.max(0, bars - l.fromBar) : l.lines.length;
      if (l.lines.length !== want) bad("lead.lines", `needs one line per bar from bar ${l.fromBar} (${want}), has ${l.lines.length}`);
      l.lines.forEach((line: unknown, b: number) => {
        const p = `lead.lines[${b}]`;
        if (!Array.isArray(line) || !line.length) return bad(p, "needs at least one note");
        let sum = 0;
        line.forEach((n: unknown, k: number) => {
          if (!Array.isArray(n) || n.length !== 2) return bad(`${p}[${k}]`, "expected [pitch, beats]");
          midi(`${p}[${k}][0]`, n[0]);
          num(`${p}[${k}][1]`, n[1], 0.0625, bpb);
          if (isNum(n[1])) sum += n[1];
        });
        if (Math.abs(sum - bpb) > EPS) bad(p, `the notes last ${sum} beats, the bar has ${bpb}`);
      });
    }
  } else bad("lead", "expected an object");

  return errs;
}

/** The song, or an error listing every problem with the path to it. */
export function parseSongSpec(data: unknown, opts?: ValidateOptions): SongSpec {
  const errs = validateSongSpec(data, opts);
  if (errs.length) throw new Error("Invalid song:\n" + errs.map((e) => "  " + e).join("\n"));
  return data as SongSpec;
}

const LINE = 100;
const inline = (v: unknown): string =>
  Array.isArray(v)
    ? "[" + v.map(inline).join(", ") + "]"
    : isObj(v)
      ? "{ " + Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(", ") + " }"
      : JSON.stringify(v);

function layout(v: unknown, pad: string): string {
  const one = inline(v);
  if (pad.length + one.length <= LINE || typeof v !== "object" || v === null) return one;
  const deeper = pad + "  ";
  if (Array.isArray(v)) return "[\n" + v.map((x) => deeper + layout(x, deeper)).join(",\n") + "\n" + pad + "]";
  const entries = Object.entries(v as Record<string, unknown>);
  return "{\n" + entries.map(([k, x]) => `${deeper}${JSON.stringify(k)}: ${layout(x, deeper)}`).join(",\n") + "\n" + pad + "}";
}

/** The JSON text of a song: short pieces on one line (a chord, a bar of the lead), the rest indented. */
export function formatSongSpec(song: SongSpec): string {
  return layout(song, "") + "\n";
}
