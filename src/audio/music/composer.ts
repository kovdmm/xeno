// The composer: turns a song (tracks of notes placed on a time grid, like a piano roll) into a score. It knows
// nothing about any particular tune (those are data, see songs/) and nothing about sound (see instruments.ts
// and render.ts): it only puts each note of each track into the score with the track's loudness and gate.
import { INSTRUMENTS, isPitchedVoice } from "./instruments";
import { MODES, modeOf, type SoundMode } from "./modes";
import type { Note, Score, Track } from "./score";

/** [start in beats from the beginning of the loop, MIDI pitch, length in beats, velocity 0..1 (default 1)]. Drums ignore the pitch and the length. */
export type NoteSpec = [beat: number, pitch: number, beats: number, velocity?: number];

export interface EchoSpec {
  /** the instrument the repeats are played with */
  instrument: string;
  delaySeconds: number;
  vol: number;
  gate: number;
}

export interface TrackSpec {
  /** what the track is called in an editor; unique within a song */
  name: string;
  /** a name from instruments.ts */
  instrument: string;
  /** loudness of the whole track 0..1 */
  vol: number;
  /** share of a note's length the key is held 0..1 (default 1) */
  gate?: number;
  /** a faint repeat of every note, a little later */
  echo?: EchoSpec;
  notes: NoteSpec[];
}

export interface SongSpec {
  /** how it sounds: the instruments it may use and how it is rendered (see modes.ts); songs that do not say are "lofi" */
  sound?: SoundMode;
  bpm: number;
  beatsPerBar: number;
  /** the length of the loop */
  bars: number;
  tracks: TrackSpec[];
}

/**
 * One channel of a chip plays one note at a time: of notes that start together the highest is kept, and a note
 * stops where the next one starts.
 */
export function oneAtATime(notes: NoteSpec[]): NoteSpec[] {
  const byBeat = new Map<number, NoteSpec>();
  for (const n of notes) {
    const have = byBeat.get(n[0]);
    if (!have || n[1] > have[1]) byBeat.set(n[0], n);
  }
  const starts = [...byBeat.keys()].sort((a, b) => a - b);
  return starts.map((beat, i) => {
    const n = byBeat.get(beat)!;
    const next = starts[i + 1];
    return next !== undefined && beat + n[2] > next ? ([n[0], n[1], next - beat, ...n.slice(3)] as NoteSpec) : n;
  });
}

export function composeSong(song: SongSpec): Score {
  const mono = MODES[modeOf(song)].monophonic;
  const tracks: Track[] = song.tracks.map((t) => {
    const voice = INSTRUMENTS[t.instrument];
    const played = mono && voice && isPitchedVoice(voice) ? oneAtATime(t.notes) : t.notes;
    const notes: Note[] = [];
    for (const [beat, pitch, dur, velocity = 1] of played)
      notes.push({ beat, dur, instrument: t.instrument, pitch, vol: t.vol * velocity, gate: t.gate });
    if (t.echo)
      for (const [beat, pitch, dur, velocity = 1] of played)
        notes.push({
          beat,
          dur,
          instrument: t.echo.instrument,
          pitch,
          vol: t.echo.vol * velocity,
          gate: t.echo.gate,
          delay: t.echo.delaySeconds,
        });
    return { name: t.name, notes };
  });
  return { bpm: song.bpm, beatsPerBar: song.beatsPerBar, bars: song.bars, tracks };
}

/** How the renderer should be set up for a song: its mode's sample rate, rounding and headroom. */
export function renderSettings(song: SongSpec): { sampleRate: number; crushSteps: number; headroom: number } {
  const { sampleRate, crushSteps, headroom } = MODES[modeOf(song)];
  return { sampleRate, crushSteps, headroom };
}
