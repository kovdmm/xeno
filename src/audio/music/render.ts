// The renderer: turns a score into one seamless loop of samples, using the instruments' definitions.
import { TWO_PI, mtof, tri } from "../dsp";
import {
  INSTRUMENTS,
  type Instrument,
  type KickInstrument,
  type SnareInstrument,
  type HatInstrument,
  type ToneInstrument,
} from "./instruments";
import { type Note, type Score, secondsPerBeat } from "./score";

export interface RenderOptions {
  /** samples per second (default 16000: lo-fi on purpose) */
  sampleRate?: number;
  /** the loop is scaled to peak at this level when it would be louder (default 0.8) */
  headroom?: number;
  /** amplitude steps per unit for the "6-bit console" crush (default 40) */
  crushSteps?: number;
  /** start value of the noise generator for drums */
  noiseSeed?: number;
  instruments?: Record<string, Instrument>;
}

/** The loop's length in samples. */
export const loopLength = (score: Score, sampleRate = 16000): number =>
  Math.round(score.bars * score.beatsPerBar * secondsPerBeat(score) * sampleRate);

export function renderScore(score: Score, opts: RenderOptions = {}): Float32Array {
  const MSR = opts.sampleRate ?? 16000,
    instruments = opts.instruments ?? INSTRUMENTS,
    LEN = loopLength(score, MSR),
    beat = secondsPerBeat(score),
    out = new Float32Array(LEN);

  // 16-bit linear-feedback shift register: the drums' noise, identical on every render
  let seed = opts.noiseSeed ?? 0xace1;
  const noise = () => {
    const b = ((seed >> 0) ^ (seed >> 2) ^ (seed >> 3) ^ (seed >> 5)) & 1;
    seed = (seed >> 1) | (b << 15);
    return seed & 1 ? 1 : -1;
  };

  // add a note; samples past the end wrap round so the loop is seamless
  function tone(t0: number, dur: number, vol: number, inst: ToneInstrument, f: number) {
    const s0 = Math.round(t0 * MSR),
      att = inst.att || 0.004,
      dec = inst.dec || 0,
      sus = inst.sus ?? 1,
      rel = inst.rel || 0.04,
      n = Math.round((dur + rel) * MSR);
    let phs = 0;
    for (let i = 0; i < n; i++) {
      const t = i / MSR;
      let e = t < att ? t / att : dec ? sus + (1 - sus) * Math.exp(-(t - att) / dec) : 1;
      if (t > dur) e *= Math.max(0, 1 - (t - dur) / rel);
      let fr = f;
      if (inst.vib && t > 0.18) fr *= 1 + inst.vib * Math.sin(TWO_PI * 5.5 * t);
      phs += fr / MSR;
      out[(s0 + i) % LEN] += inst.wave(phs) * e * vol;
    }
  }
  function kick(s0: number, d: KickInstrument) {
    let p = 0;
    for (let i = 0; i < MSR * d.dur; i++) {
      const t = i / MSR;
      p += (d.f0 + d.sweep * Math.exp(-t * d.sweepRate)) / MSR;
      out[(s0 + i) % LEN] += tri(p) * Math.exp(-t * d.decay) * d.gain;
    }
  }
  function snare(s0: number, d: SnareInstrument) {
    let y = 0;
    for (let i = 0; i < MSR * d.dur; i++) {
      const t = i / MSR,
        x = noise();
      y += d.smooth * (x - y);
      out[(s0 + i) % LEN] += (y * d.noiseGain + Math.sin(TWO_PI * d.toneHz * t) * d.toneGain) * Math.exp(-t * d.decay);
    }
  }
  function hat(s0: number, d: HatInstrument) {
    let y = 0;
    for (let i = 0; i < MSR * d.dur; i++) {
      const t = i / MSR,
        x = noise();
      y += d.smooth * (x - y);
      out[(s0 + i) % LEN] += (x - y) * d.gain * Math.exp(-t * d.decay);
    }
  }

  function play(n: Note) {
    const inst = instruments[n.instrument];
    if (!inst) throw new Error(`score: unknown instrument "${n.instrument}"`);
    const t0 = n.beat * beat + (n.delay ?? 0);
    if (inst.kind === "tone") tone(t0, n.dur * beat * (n.gate ?? 1), n.vol, inst, mtof(n.pitch!));
    else if (inst.kind === "kick") kick(Math.round(t0 * MSR), inst);
    else if (inst.kind === "snare") snare(Math.round(t0 * MSR), inst);
    else hat(Math.round(t0 * MSR), inst);
  }

  // Sum bar by bar, track by track (the order of notes inside a track is kept): the same additions in the same
  // order always give the same samples.
  const byBar = score.tracks.map((tr) => {
    const bars: Note[][] = Array.from({ length: score.bars }, () => []);
    for (const n of tr.notes) bars[Math.floor(n.beat / score.beatsPerBar)].push(n);
    return bars;
  });
  for (let b = 0; b < score.bars; b++) for (const bars of byBar) for (const n of bars[b]) play(n);

  // gentle bit-crush for the console grit, then headroom
  const headroom = opts.headroom ?? 0.8,
    steps = opts.crushSteps ?? 40;
  let pk = 0;
  for (let i = 0; i < LEN; i++) pk = Math.max(pk, Math.abs(out[i]));
  const g = headroom / Math.max(headroom, pk);
  for (let i = 0; i < LEN; i++) out[i] = Math.round(out[i] * g * steps) / steps;
  return out;
}
