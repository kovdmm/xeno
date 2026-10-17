// Instruments of the score: how a note named "bass" or "kick" sounds. Like an old console: a few simple
// waves with an envelope, and noise drums.
import { pulse, tri } from "../dsp";

/** A pitched voice: a wave shape (phase in cycles) with an attack/decay/sustain/release envelope. */
export interface ToneInstrument {
  kind: "tone";
  wave: (phase: number) => number;
  /** attack, s (default 0.004) */
  att?: number;
  /** decay time constant, s (0 = no decay) */
  dec?: number;
  /** level the decay settles on, 0..1 (default 1) */
  sus?: number;
  /** release, s (default 0.04) */
  rel?: number;
  /** vibrato depth as a fraction of the frequency; starts 0.18 s into the note */
  vib?: number;
}

/** Kick: a falling sine-ish thump (triangle wave with a pitch sweep). */
export interface KickInstrument {
  kind: "kick";
  dur: number;
  f0: number;
  sweep: number;
  sweepRate: number;
  decay: number;
  gain: number;
}

/** Snare: low-passed noise plus a short tone. */
export interface SnareInstrument {
  kind: "snare";
  dur: number;
  /** low-pass coefficient: higher is brighter */
  smooth: number;
  noiseGain: number;
  toneHz: number;
  toneGain: number;
  decay: number;
}

/** Hi-hat: high-passed noise. */
export interface HatInstrument {
  kind: "hat";
  dur: number;
  smooth: number;
  gain: number;
  decay: number;
}

export type Instrument = ToneInstrument | KickInstrument | SnareInstrument | HatInstrument;

export const INSTRUMENTS: Record<string, Instrument> = {
  bass: { kind: "tone", wave: tri, rel: 0.02 },
  arp: { kind: "tone", wave: (x) => pulse(x, 0.125), dec: 0.05, sus: 0.3, rel: 0.02 },
  drone: { kind: "tone", wave: (x) => pulse(x, 0.25), att: 0.3, rel: 0.3 },
  lead: { kind: "tone", wave: (x) => pulse(x, 0.5), att: 0.01, dec: 0.25, sus: 0.7, rel: 0.06, vib: 0.008 },
  leadEcho: { kind: "tone", wave: (x) => pulse(x, 0.5), att: 0.01, rel: 0.06 },
  kick: { kind: "kick", dur: 0.22, f0: 45, sweep: 100, sweepRate: 30, decay: 14, gain: 0.42 },
  snare: { kind: "snare", dur: 0.16, smooth: 0.6, noiseGain: 0.2, toneHz: 190, toneGain: 0.08, decay: 24 },
  hat: { kind: "hat", dur: 0.045, smooth: 0.5, gain: 0.07, decay: 70 },
};
