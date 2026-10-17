// A score: what is played and when, with no sound in it. The composer produces one, the renderer turns
// it into samples, and a player plays the result.

export interface Note {
  /** start, in beats from the beginning of the loop */
  beat: number;
  /** length in beats */
  dur: number;
  /** name of an instrument from instruments.ts */
  instrument: string;
  /** MIDI note number; drums ignore it */
  pitch?: number;
  /** loudness 0..1 */
  vol: number;
  /** share of `dur` the key is held; the instrument's release follows. Default 1 */
  gate?: number;
  /** extra delay after `beat`, in seconds (echoes) */
  delay?: number;
}

export interface Track {
  name: string;
  /** in the order they should be mixed; the renderer sums bar by bar, track by track */
  notes: Note[];
}

export interface Score {
  bpm: number;
  beatsPerBar: number;
  bars: number;
  tracks: Track[];
}

export const secondsPerBeat = (s: Pick<Score, "bpm">): number => 60 / s.bpm;
