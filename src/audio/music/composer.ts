// The composer: turns a song description (chords, melody, arrangement) into a score of notes. It knows how
// bass lines, arpeggios and drum patterns are built, but nothing about any particular tune: those are data
// (see songs/) and nothing about sound either (see instruments.ts and render.ts).
import type { Note, Score, Track } from "./score";

export interface Chord {
  /** MIDI root of the bass line */
  bass: number;
  /** MIDI root of the arpeggio */
  arp: number;
  minor: boolean;
}

export interface DrumPattern {
  instrument: string;
  /** hits within a bar, in beats */
  beats: number[];
  /** first bar (0-based) the pattern plays in; default 0 */
  fromBar?: number;
}

export interface SongSpec {
  bpm: number;
  beatsPerBar: number;
  chords: Record<string, Chord>;
  /** the chord of each bar: the length of the song */
  progression: string[];
  /** eighth-note bass: semitones above the root, one per step, played an octave up */
  bass: { steps: number[]; stepBeats: number; octave: number; vol: number; gate: number };
  /** sixteenth-note arpeggio through the triad (and the root an octave up) */
  arp: {
    fromBar: number;
    stepBeats: number;
    gate: number;
    /** loudness before and from `louderFromBar` */
    vol: number;
    louderVol: number;
    louderFromBar: number;
    /** on odd bars the second half of the bar sounds this many semitones higher */
    liftSemitones: number;
  };
  /** one long quiet note per bar on the bass root */
  drone: { octave: number; vol: number; gate: number };
  drums: DrumPattern[];
  /** one-off hits that replace nothing: they are added to a given bar */
  fills: { bar: number; hits: [instrument: string, beat: number][] }[];
  lead: {
    fromBar: number;
    /** for each bar from `fromBar`: [MIDI note, length in beats] */
    lines: [pitch: number, beats: number][][];
    vol: number;
    gate: number;
    /** a faint repeat of every lead note */
    echo: { delaySeconds: number; vol: number; gate: number };
  };
}

const TRIAD = { minor: [0, 3, 7, 12], major: [0, 4, 7, 12] };

export function composeSong(song: SongSpec): Score {
  const bars = song.progression.length;
  const bass: Track = { name: "bass", notes: [] };
  const arp: Track = { name: "arpeggio", notes: [] };
  const drone: Track = { name: "drone", notes: [] };
  const drums: Track = { name: "drums", notes: [] };
  const lead: Track = { name: "lead", notes: [] };
  const N = (track: Track, n: Note) => void track.notes.push(n);

  song.progression.forEach((name, b) => {
    const chord = song.chords[name];
    if (!chord) throw new Error(`song: bar ${b} uses unknown chord "${name}"`);
    const t = b * song.beatsPerBar; // start of the bar, in beats

    for (const [k, step] of song.bass.steps.entries())
      N(bass, {
        beat: t + k * song.bass.stepBeats,
        dur: song.bass.stepBeats,
        instrument: "bass",
        pitch: chord.bass + step + song.bass.octave,
        vol: song.bass.vol,
        gate: song.bass.gate,
      });

    if (b >= song.arp.fromBar) {
      const triad = chord.minor ? TRIAD.minor : TRIAD.major;
      const perBar = Math.round(song.beatsPerBar / song.arp.stepBeats);
      for (let k = 0; k < perBar; k++)
        N(arp, {
          beat: t + k * song.arp.stepBeats,
          dur: song.arp.stepBeats,
          instrument: "arp",
          pitch: chord.arp + triad[k % 4] + (k >= perBar / 2 && b % 2 ? song.arp.liftSemitones : 0),
          vol: b < song.arp.louderFromBar ? song.arp.vol : song.arp.louderVol,
          gate: song.arp.gate,
        });
    }

    N(drone, {
      beat: t,
      dur: song.beatsPerBar,
      instrument: "drone",
      pitch: chord.bass + song.drone.octave,
      vol: song.drone.vol,
      gate: song.drone.gate,
    });

    for (const d of song.drums) {
      if (b < (d.fromBar ?? 0)) continue;
      for (const beat of d.beats) N(drums, { beat: t + beat, dur: 0, instrument: d.instrument, vol: 1 });
    }
    for (const f of song.fills)
      if (f.bar === b)
        for (const [instrument, beat] of f.hits) N(drums, { beat: t + beat, dur: 0, instrument, vol: 1 });

    if (b >= song.lead.fromBar) {
      let o = 0;
      for (const [pitch, beats] of song.lead.lines[b - song.lead.fromBar]) {
        N(lead, { beat: t + o, dur: beats, instrument: "lead", pitch, vol: song.lead.vol, gate: song.lead.gate });
        N(lead, {
          beat: t + o,
          dur: beats,
          instrument: "leadEcho",
          pitch,
          vol: song.lead.echo.vol,
          gate: song.lead.echo.gate,
          delay: song.lead.echo.delaySeconds,
        });
        o += beats;
      }
    }
  });

  return { bpm: song.bpm, beatsPerBar: song.beatsPerBar, bars, tracks: [bass, arp, drone, drums, lead] };
}
