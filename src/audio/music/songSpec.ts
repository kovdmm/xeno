// A song is data: a SongSpec written as JSON (see songs/). This module checks such a document and prints it in a
// readable shape, so tools (the music editor next to this project) and the game agree on what a song is.
// The composer turns a valid SongSpec into a score; nothing here knows about sound beyond the instruments' names.
import type { SongSpec } from "./composer";
import { INSTRUMENTS, instrumentsOf } from "./instruments";
import { MODE_NAMES, isMode, modeOf } from "./modes";

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
/** beats are compared with a little slack: 0.1 + 0.2 + 0.7 is a whole beat too */
const EPS = 1e-6;
/** the shortest note */
export const MIN_BEATS = 0.0625;

export interface ValidateOptions {
  /** the instruments a track may use, and whether each is pitched or a hit (default: those of the song's sound mode) */
  instruments?: Record<string, { kind: string }>;
}

const PITCHED = new Set(["tone", "pluck", "fm"]);

/** Lists everything wrong with a song; an empty list means the composer can use it. */
export function validateSongSpec(data: unknown, opts: ValidateOptions = {}): string[] {
  const errs: string[] = [];
  const bad = (path: string, why: string) => errs.push(`${path}: ${why}`);
  const num = (path: string, v: unknown, min: number, max = Infinity, int = false) => {
    if (!isNum(v)) return bad(path, `expected a number, got ${JSON.stringify(v)}`);
    if (v < min || v > max) return bad(path, `must be between ${min} and ${max}, got ${v}`);
    if (int && !isInt(v)) bad(path, `must be a whole number, got ${v}`);
  };
  const level = (path: string, v: unknown) => num(path, v, 0, 1);

  if (!isObj(data)) return ["song: expected an object"];
  const s = data;
  if (s.sound !== undefined && !isMode(s.sound)) bad("sound", `unknown sound ${JSON.stringify(s.sound)} (have ${MODE_NAMES.join(", ")})`);
  const mode = modeOf({ sound: isMode(s.sound) ? s.sound : undefined });
  const instruments: Record<string, { kind: string }> =
    opts.instruments ?? Object.fromEntries(instrumentsOf(mode, true).map((n) => [n, INSTRUMENTS[n]]));
  num("bpm", s.bpm, 20, 400);
  num("beatsPerBar", s.beatsPerBar, 1, 16, true);
  num("bars", s.bars, 1, 128, true);
  const total = (isNum(s.bars) ? s.bars : 1) * (isNum(s.beatsPerBar) ? s.beatsPerBar : 4);

  if (!Array.isArray(s.tracks)) bad("tracks", "expected a list of tracks");
  else {
    if (!s.tracks.length) bad("tracks", "needs at least one track");
    const names = new Set<string>();
    s.tracks.forEach((t: any, i: number) => {
      const p = `tracks[${i}]`;
      if (!isObj(t)) return bad(p, "expected { name, instrument, vol, notes }");
      if (typeof t.name !== "string" || !t.name.trim()) bad(`${p}.name`, "expected a name");
      else if (names.has(t.name)) bad(`${p}.name`, `the name ${JSON.stringify(t.name)} is used twice`);
      else names.add(t.name);
      const inst = typeof t.instrument === "string" ? instruments[t.instrument] : undefined;
      if (!inst) bad(`${p}.instrument`, `unknown instrument ${JSON.stringify(t.instrument)} (the ${mode} sound has ${Object.keys(instruments).join(", ")})`);
      level(`${p}.vol`, t.vol);
      if (t.gate !== undefined) level(`${p}.gate`, t.gate);
      if (t.echo !== undefined) {
        if (!isObj(t.echo)) bad(`${p}.echo`, "expected { instrument, delaySeconds, vol, gate }");
        else {
          if (typeof t.echo.instrument !== "string" || !instruments[t.echo.instrument]) bad(`${p}.echo.instrument`, `unknown instrument ${JSON.stringify(t.echo.instrument)}`);
          num(`${p}.echo.delaySeconds`, t.echo.delaySeconds, 0, 5);
          level(`${p}.echo.vol`, t.echo.vol);
          level(`${p}.echo.gate`, t.echo.gate);
        }
      }
      if (!Array.isArray(t.notes)) return bad(`${p}.notes`, "expected a list of notes");
      const drum = !!inst && !PITCHED.has(inst.kind);
      t.notes.forEach((n: unknown, k: number) => {
        const q = `${p}.notes[${k}]`;
        if (!Array.isArray(n) || n.length < 3 || n.length > 4) return bad(q, "expected [beat, pitch, beats] or [beat, pitch, beats, velocity]");
        num(`${q}[0]`, n[0], 0, total - EPS);
        if (drum) {
          num(`${q}[1]`, n[1], 0, 127);
          num(`${q}[2]`, n[2], 0);
        } else {
          num(`${q}[1]`, n[1], 0, 127, true);
          num(`${q}[2]`, n[2], MIN_BEATS);
          if (isNum(n[0]) && isNum(n[2]) && n[0] + n[2] > total + EPS) bad(q, `the note ends at beat ${n[0] + n[2]}, after the end of the song (${total})`);
        }
        if (n.length === 4) level(`${q}[3]`, n[3]);
      });
    });
  }
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

/** The notes of a track: a line per bar (more lines when a bar is too long for one). */
function notesText(song: SongSpec, notes: SongSpec["tracks"][number]["notes"], pad: string): string {
  if (!notes.length) return "[]";
  const lines: string[] = [];
  let line = "";
  let bar = -1;
  for (const n of notes) {
    const b = Math.floor(n[0] / song.beatsPerBar);
    const text = inline(n);
    if (line && (b !== bar || pad.length + line.length + text.length + 2 > LINE)) (lines.push(line), (line = ""));
    line += (line ? ", " : "") + text;
    bar = b;
  }
  lines.push(line);
  return "[\n" + lines.map((l) => pad + "  " + l).join(",\n") + "\n" + pad + "]";
}

/** The JSON text of a song: the numbers on their own lines, the notes a bar to a line. */
export function formatSongSpec(song: SongSpec): string {
  const out: string[] = ["{", ...(song.sound ? [`  "sound": ${JSON.stringify(song.sound)},`] : []), `  "bpm": ${song.bpm},`, `  "beatsPerBar": ${song.beatsPerBar},`, `  "bars": ${song.bars},`, '  "tracks": ['];
  out.push(
    song.tracks
      .map((t) => {
        const head = [`"name": ${JSON.stringify(t.name)}`, `"instrument": ${JSON.stringify(t.instrument)}`, `"vol": ${t.vol}`];
        if (t.gate !== undefined) head.push(`"gate": ${t.gate}`);
        if (t.echo) head.push(`"echo": ${inline(t.echo)}`);
        return ["    {", ...head.map((h) => `      ${h},`), `      "notes": ${notesText(song, t.notes, "      ")}`, "    }"].join("\n");
      })
      .join(",\n"),
  );
  out.push("  ]", "}");
  return out.join("\n") + "\n";
}
