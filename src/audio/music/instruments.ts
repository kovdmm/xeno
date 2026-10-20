// Instruments of the score: how a note named "bass" or "kick" sounds. A voice is the recipe the renderer plays
// (a wave with an envelope, a plucked string, an FM pair, a noise channel, a drum); the rest says where the
// instrument belongs: its sound mode (see modes.ts), its role (so a song can be moved from one mode to another),
// and a loudness a new track can start with.
import { TWO_PI, pulse, tri } from "../dsp";
import type { SoundMode } from "./modes";

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
  /** several copies of the wave at these multiples of the pitch, summed (a detuned chorus: [1, 1.005, 0.995]) */
  layers?: number[];
  /** one-pole low-pass, 0..1: smaller is duller */
  lp?: number;
  /** soft clipping: the signal goes through tanh(x · drive) */
  drive?: number;
  /** the envelope is rounded to this many levels (a chip's 4-bit volume) */
  steps?: number;
}

/** A plucked string (Karplus-Strong): a burst of noise circulating in a loop that loses a little each time round. */
export interface PluckInstrument {
  kind: "pluck";
  /** how much of the string's energy is left after one trip round the loop: closer to 1 rings longer */
  decay: number;
  /** how bright the pluck starts, 0..1 (the noise burst is low-passed with this) */
  bright: number;
  /** distortion: the output goes through tanh(x · drive) */
  drive?: number;
  /** release when the note ends (the hand mutes the string), s */
  rel?: number;
}

/** Two sine operators: the second bends the pitch of the first, with a bend that dies away (a bell, a piano, a brass). */
export interface FmInstrument {
  kind: "fm";
  /** pitch of the modulator relative to the note (non-whole ratios sound like metal) */
  ratio: number;
  /** how strongly the modulator bends the carrier at the start, and the time constant (s) the bend dies with */
  index: number;
  indexDecay: number;
  att?: number;
  dec?: number;
  sus?: number;
  rel?: number;
}

/** The noise channel of a chip: a shift register stepped at `rate` Hz; `short` is the metallic 93-step mode. */
export interface NoiseInstrument {
  kind: "noise";
  dur: number;
  rate: number;
  short: boolean;
  gain: number;
  decay: number;
  steps?: number;
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
  /** the wave is rounded to this many levels (a chip's 4-bit triangle) */
  levels?: number;
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

/** What the renderer plays. */
export type Voice = ToneInstrument | PluckInstrument | FmInstrument | NoiseInstrument | KickInstrument | SnareInstrument | HatInstrument;

/** What an instrument is for: moving a song to another mode swaps each instrument for the first one of its role. */
export type Role = "bass" | "harmony" | "arp" | "lead" | "pad" | "kick" | "snare" | "hat" | "perc";

export interface Meta {
  mode: SoundMode;
  role: Role;
  /** for the person choosing */
  label: string;
  /** a loudness a new track of it starts with */
  vol: number;
  /** only an echo uses it: it is not offered as an instrument of its own */
  echoOnly?: boolean;
}

export type Instrument = Voice & Meta;

/** Pitched voices take a pitch and a length; the rest (drums, noise) are a hit. */
export const isPitchedVoice = (v: Voice): boolean => v.kind === "tone" || v.kind === "pluck" || v.kind === "fm";

/* ---------- waves ---------- */

const saw = (x: number) => (x - Math.floor(x)) * 2 - 1;
const sine = (x: number) => Math.sin(TWO_PI * x);
/** the triangle of a chip: 16 steps */
const tri4 = (x: number) => Math.round(tri(x) * 7.5) / 7.5;
/** a few harmonics: an organ */
const organWave = (x: number) => (sine(x) + 0.5 * sine(2 * x) + 0.3 * sine(3 * x) + 0.2 * sine(4 * x)) / 1.6;

const lofi = (role: Role, label: string, vol: number, extra: Partial<Meta> = {}): Meta => ({ mode: "lofi", role, label, vol, ...extra });
const chip = (role: Role, label: string, vol: number): Meta => ({ mode: "chip", role, label, vol });
const clean = (role: Role, label: string, vol: number): Meta => ({ mode: "clean", role, label, vol });

export const INSTRUMENTS: Record<string, Instrument> = {
  /* ----- lofi: the game's console sound ----- */
  bass: { kind: "tone", wave: tri, rel: 0.02, ...lofi("bass", "Bass (triangle)", 0.3) },
  arp: { kind: "tone", wave: (x) => pulse(x, 0.125), dec: 0.05, sus: 0.3, rel: 0.02, ...lofi("arp", "Arpeggio (thin pulse)", 0.06) },
  drone: { kind: "tone", wave: (x) => pulse(x, 0.25), att: 0.3, rel: 0.3, ...lofi("pad", "Drone (slow pulse)", 0.05) },
  lead: { kind: "tone", wave: (x) => pulse(x, 0.5), att: 0.01, dec: 0.25, sus: 0.7, rel: 0.06, vib: 0.008, ...lofi("lead", "Lead (square)", 0.13) },
  leadEcho: { kind: "tone", wave: (x) => pulse(x, 0.5), att: 0.01, rel: 0.06, ...lofi("lead", "Lead echo", 0.035, { echoOnly: true }) },
  kick: { kind: "kick", dur: 0.22, f0: 45, sweep: 100, sweepRate: 30, decay: 14, gain: 0.42, ...lofi("kick", "Kick", 1) },
  snare: { kind: "snare", dur: 0.16, smooth: 0.6, noiseGain: 0.2, toneHz: 190, toneGain: 0.08, decay: 24, ...lofi("snare", "Snare", 1) },
  hat: { kind: "hat", dur: 0.045, smooth: 0.5, gain: 0.07, decay: 70, ...lofi("hat", "Hi-hat", 1) },

  /* ----- chip: an 8-bit machine (16 loudness levels, a 4-bit triangle, a shift-register noise channel) ----- */
  chipLead: { kind: "tone", wave: (x) => pulse(x, 0.5), att: 0.003, dec: 0.3, sus: 0.6, rel: 0.02, vib: 0.006, steps: 15, ...chip("lead", "Square lead", 0.13) },
  chipLeadSoft: { kind: "tone", wave: (x) => pulse(x, 0.25), att: 0.003, dec: 0.35, sus: 0.5, rel: 0.02, vib: 0.007, steps: 15, ...chip("lead", "Reedy lead (25 %)", 0.13) },
  chipHarmony: { kind: "tone", wave: (x) => pulse(x, 0.25), att: 0.003, dec: 0.12, sus: 0.45, rel: 0.02, steps: 15, ...chip("harmony", "Harmony (25 %)", 0.08) },
  chipArp: { kind: "tone", wave: (x) => pulse(x, 0.125), att: 0.002, dec: 0.05, sus: 0.3, rel: 0.01, steps: 15, ...chip("arp", "Arpeggio (12.5 %)", 0.06) },
  chipBass: { kind: "tone", wave: tri4, att: 0.002, rel: 0.01, ...chip("bass", "Triangle bass (4-bit)", 0.3) },
  chipKick: { kind: "kick", dur: 0.18, f0: 40, sweep: 90, sweepRate: 35, decay: 16, gain: 0.45, levels: 16, ...chip("kick", "Kick (triangle)", 1) },
  chipSnare: { kind: "noise", dur: 0.14, rate: 5000, short: false, gain: 0.3, decay: 26, steps: 15, ...chip("snare", "Snare (noise)", 1) },
  chipHat: { kind: "noise", dur: 0.04, rate: 14000, short: true, gain: 0.16, decay: 90, steps: 15, ...chip("hat", "Hi-hat (metal noise)", 1) },
  chipOpenHat: { kind: "noise", dur: 0.22, rate: 14000, short: true, gain: 0.14, decay: 14, steps: 15, ...chip("hat", "Open hat", 1) },
  chipTom: { kind: "kick", dur: 0.26, f0: 85, sweep: 70, sweepRate: 22, decay: 9, gain: 0.45, levels: 16, ...chip("perc", "Tom (triangle)", 1) },
  chipCrash: { kind: "noise", dur: 0.7, rate: 9000, short: false, gain: 0.16, decay: 5, steps: 15, ...chip("perc", "Crash", 1) },

  /* ----- clean: plucked strings, keys, pads, a drum kit ----- */
  guitar: { kind: "pluck", decay: 0.9965, bright: 0.65, rel: 0.12, ...clean("harmony", "Acoustic guitar", 0.3) },
  nylon: { kind: "pluck", decay: 0.995, bright: 0.28, rel: 0.15, ...clean("arp", "Nylon guitar", 0.3) },
  guitarMuted: { kind: "pluck", decay: 0.96, bright: 0.5, rel: 0.05, ...clean("harmony", "Palm-muted guitar", 0.35) },
  synthLead: { kind: "tone", wave: saw, layers: [1, 1.004, 0.996], lp: 0.35, att: 0.01, dec: 0.5, sus: 0.7, rel: 0.1, vib: 0.005, ...clean("lead", "Synth lead", 0.14) },
  guitarElectric: { kind: "pluck", decay: 0.9985, bright: 0.8, drive: 5, rel: 0.1, ...clean("lead", "Electric guitar (overdrive)", 0.22) },
  bassPluck: { kind: "pluck", decay: 0.999, bright: 0.12, rel: 0.1, ...clean("bass", "Plucked bass", 0.45) },
  bassSub: { kind: "tone", wave: sine, att: 0.01, rel: 0.08, drive: 1.6, ...clean("bass", "Sub bass", 0.35) },
  bassSynth: { kind: "tone", wave: saw, layers: [1, 1.004], lp: 0.1, att: 0.008, dec: 0.4, sus: 0.7, rel: 0.06, drive: 2, ...clean("bass", "Synth bass", 0.2) },
  piano: { kind: "fm", ratio: 1, index: 2.4, indexDecay: 0.35, att: 0.003, dec: 1.1, sus: 0.12, rel: 0.25, ...clean("harmony", "Piano", 0.35) },
  epiano: { kind: "fm", ratio: 1, index: 1.3, indexDecay: 0.7, att: 0.004, dec: 1.6, sus: 0.3, rel: 0.3, ...clean("harmony", "Electric piano", 0.3) },
  bell: { kind: "fm", ratio: 3.5, index: 4.5, indexDecay: 1.4, att: 0.002, dec: 2.2, sus: 0, rel: 0.4, ...clean("lead", "Bell", 0.25) },
  marimba: { kind: "fm", ratio: 4, index: 1.6, indexDecay: 0.06, att: 0.002, dec: 0.3, sus: 0, rel: 0.05, ...clean("lead", "Marimba", 0.4) },
  brass: { kind: "fm", ratio: 1, index: 2.6, indexDecay: 0.5, att: 0.07, dec: 0.4, sus: 0.8, rel: 0.1, ...clean("lead", "Brass", 0.22) },
  flute: { kind: "tone", wave: sine, att: 0.07, rel: 0.1, vib: 0.01, lp: 0.6, ...clean("lead", "Flute", 0.3) },
  organ: { kind: "tone", wave: organWave, att: 0.01, rel: 0.05, ...clean("harmony", "Organ", 0.2) },
  pad: { kind: "tone", wave: saw, layers: [1, 1.006, 0.994], lp: 0.12, att: 0.4, rel: 0.6, ...clean("pad", "Pad", 0.1) },
  strings: { kind: "tone", wave: saw, layers: [1, 1.004, 0.996], lp: 0.25, att: 0.25, rel: 0.35, vib: 0.004, ...clean("pad", "Strings", 0.1) },
  cleanKick: { kind: "kick", dur: 0.45, f0: 42, sweep: 90, sweepRate: 18, decay: 6.5, gain: 0.6, ...clean("kick", "Kick", 1) },
  cleanSnare: { kind: "snare", dur: 0.24, smooth: 0.5, noiseGain: 0.25, toneHz: 180, toneGain: 0.12, decay: 16, ...clean("snare", "Snare", 1) },
  cleanClap: { kind: "snare", dur: 0.18, smooth: 0.8, noiseGain: 0.3, toneHz: 1000, toneGain: 0, decay: 26, ...clean("perc", "Clap", 1) },
  cleanHat: { kind: "hat", dur: 0.06, smooth: 0.35, gain: 0.09, decay: 55, ...clean("hat", "Hi-hat", 1) },
  cleanOpenHat: { kind: "hat", dur: 0.3, smooth: 0.35, gain: 0.09, decay: 12, ...clean("hat", "Open hat", 1) },
  cleanTom: { kind: "kick", dur: 0.35, f0: 95, sweep: 60, sweepRate: 20, decay: 8, gain: 0.5, ...clean("perc", "Tom", 1) },
  cleanCrash: { kind: "hat", dur: 1.2, smooth: 0.3, gain: 0.1, decay: 3.5, ...clean("perc", "Crash", 1) },
};

/** the names of the instruments of a mode, in the order above (echo-only ones left out unless asked for) */
export function instrumentsOf(mode: SoundMode, withEchoOnly = false): string[] {
  return Object.keys(INSTRUMENTS).filter((n) => INSTRUMENTS[n].mode === mode && (withEchoOnly || !INSTRUMENTS[n].echoOnly));
}

/** when a mode has no instrument of a role, these roles are tried next */
const FALLBACK: Partial<Record<Role, Role[]>> = {
  arp: ["harmony", "lead"],
  harmony: ["arp", "lead"],
  pad: ["harmony", "arp", "lead"],
  lead: ["harmony", "arp"],
  perc: ["snare", "hat"],
  hat: ["perc"],
  snare: ["perc"],
};

/** The instrument that plays the same part in another mode (the first of that role), or null when there is none. */
export function counterpart(name: string, mode: SoundMode): string | null {
  const from = INSTRUMENTS[name];
  if (!from) return null;
  if (from.mode === mode) return name;
  const here = instrumentsOf(mode);
  for (const role of [from.role, ...(FALLBACK[from.role] ?? [])]) {
    const found = here.find((n) => INSTRUMENTS[n].role === role);
    if (found) return found;
  }
  return null;
}
