// The renderer: turns a score into one seamless loop of samples, using the instruments' definitions.
import { TWO_PI, mtof, tri } from "../dsp";
import {
  INSTRUMENTS,
  type FmInstrument,
  type HatInstrument,
  type KickInstrument,
  type NoiseInstrument,
  type PluckInstrument,
  type SnareInstrument,
  type ToneInstrument,
  type Voice,
} from "./instruments";
import { type Note, type Score, secondsPerBeat } from "./score";

export interface RenderOptions {
  /** samples per second (default 16000: lo-fi on purpose) */
  sampleRate?: number;
  /** the loop is scaled to peak at this level when it would be louder (default 0.8) */
  headroom?: number;
  /** amplitude steps per unit for the "6-bit console" crush (default 40; 0 leaves the loudness as it is) */
  crushSteps?: number;
  /** start value of the noise generator for drums */
  noiseSeed?: number;
  instruments?: Record<string, Voice>;
}

/** The loop's length in samples. */
export const loopLength = (score: Score, sampleRate = 16000): number =>
  Math.round(score.bars * score.beatsPerBar * secondsPerBeat(score) * sampleRate);

export function renderScore(score: Score, opts: RenderOptions = {}): Float32Array {
  const MSR = opts.sampleRate ?? 16000,
    instruments: Record<string, Voice> = opts.instruments ?? INSTRUMENTS,
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

  /** the envelope of a note: attack, decay towards a sustain level, release after `dur` */
  const envelope = (t: number, dur: number, att: number, dec: number, sus: number, rel: number, steps?: number) => {
    let e = t < att ? t / att : dec ? sus + (1 - sus) * Math.exp(-(t - att) / dec) : 1;
    if (t > dur) e *= Math.max(0, 1 - (t - dur) / rel);
    return steps ? Math.round(e * steps) / steps : e;
  };

  // add a note; samples past the end wrap round so the loop is seamless
  function tone(t0: number, dur: number, vol: number, inst: ToneInstrument, f: number) {
    const s0 = Math.round(t0 * MSR),
      att = inst.att || 0.004,
      dec = inst.dec || 0,
      sus = inst.sus ?? 1,
      rel = inst.rel || 0.04,
      n = Math.round((dur + rel) * MSR),
      layers = inst.layers ?? [1],
      phases = layers.map(() => 0);
    let low = 0;
    for (let i = 0; i < n; i++) {
      const t = i / MSR;
      const e = envelope(t, dur, att, dec, sus, rel, inst.steps);
      let fr = f;
      if (inst.vib && t > 0.18) fr *= 1 + inst.vib * Math.sin(TWO_PI * 5.5 * t);
      let x = 0;
      for (let k = 0; k < layers.length; k++) {
        phases[k] += (fr * layers[k]) / MSR;
        x += inst.wave(phases[k]);
      }
      if (layers.length > 1) x /= layers.length;
      if (inst.lp) x = low += inst.lp * (x - low);
      if (inst.drive) x = Math.tanh(x * inst.drive);
      out[(s0 + i) % LEN] += x * e * vol;
    }
  }
  /** a string: noise in a loop as long as one period of the pitch, each trip round it loses a little and dulls */
  function pluck(t0: number, dur: number, vol: number, inst: PluckInstrument, f: number) {
    const s0 = Math.round(t0 * MSR),
      rel = inst.rel ?? 0.1,
      n = Math.round((dur + rel) * MSR),
      len = Math.max(2, Math.round(MSR / f - 0.5)),
      ring = new Float32Array(len);
    let y = 0;
    for (let i = 0; i < len; i++) ring[i] = y += inst.bright * (noise() - y); // the pluck: low-passed noise
    let prev = ring[len - 1];
    for (let i = 0; i < n; i++) {
      const k = i % len;
      const v = inst.decay * 0.5 * (ring[k] + prev);
      prev = ring[k];
      ring[k] = v;
      const t = i / MSR;
      let x = inst.drive ? Math.tanh(v * 2.5 * inst.drive) : v * 2.2;
      if (t > dur) x *= Math.max(0, 1 - (t - dur) / rel);
      out[(s0 + i) % LEN] += x * vol;
    }
  }
  /** two sines: the second bends the first, less and less as the note goes on */
  function fm(t0: number, dur: number, vol: number, inst: FmInstrument, f: number) {
    const s0 = Math.round(t0 * MSR),
      att = inst.att || 0.004,
      dec = inst.dec || 0,
      sus = inst.sus ?? 1,
      rel = inst.rel || 0.05,
      n = Math.round((dur + rel) * MSR);
    let carrier = 0,
      modulator = 0;
    for (let i = 0; i < n; i++) {
      const t = i / MSR;
      carrier += f / MSR;
      modulator += (f * inst.ratio) / MSR;
      const bend = inst.index * Math.exp(-t / inst.indexDecay);
      out[(s0 + i) % LEN] += Math.sin(TWO_PI * carrier + bend * Math.sin(TWO_PI * modulator)) * envelope(t, dur, att, dec, sus, rel) * vol;
    }
  }
  /** the noise channel of a chip: a 15-bit shift register stepped at a fixed rate */
  function chipNoise(s0: number, d: NoiseInstrument, vol: number) {
    let reg = 1;
    let level = 1;
    let clock = 0;
    for (let i = 0; i < MSR * d.dur; i++) {
      clock += d.rate / MSR;
      while (clock >= 1) {
        clock -= 1;
        const bit = (reg ^ (reg >> (d.short ? 6 : 1))) & 1;
        reg = (reg >> 1) | (bit << 14);
        level = reg & 1 ? 1 : -1;
      }
      let e = Math.exp(-(i / MSR) * d.decay);
      if (d.steps) e = Math.round(e * d.steps) / d.steps;
      out[(s0 + i) % LEN] += level * e * d.gain * vol;
    }
  }
function kick(s0: number, d: KickInstrument, vol: number) {
    let p = 0;
    for (let i = 0; i < MSR * d.dur; i++) {
      const t = i / MSR;
      p += (d.f0 + d.sweep * Math.exp(-t * d.sweepRate)) / MSR;
      const w = d.levels ? Math.round((tri(p) * (d.levels - 1)) / 2) / ((d.levels - 1) / 2) : tri(p);
      out[(s0 + i) % LEN] += w * Math.exp(-t * d.decay) * d.gain * vol;
    }
  }
  function snare(s0: number, d: SnareInstrument, vol: number) {
    let y = 0;
    for (let i = 0; i < MSR * d.dur; i++) {
      const t = i / MSR,
        x = noise();
      y += d.smooth * (x - y);
      out[(s0 + i) % LEN] += (y * d.noiseGain + Math.sin(TWO_PI * d.toneHz * t) * d.toneGain) * Math.exp(-t * d.decay) * vol;
    }
  }
  function hat(s0: number, d: HatInstrument, vol: number) {
    let y = 0;
    for (let i = 0; i < MSR * d.dur; i++) {
      const t = i / MSR,
        x = noise();
      y += d.smooth * (x - y);
      out[(s0 + i) % LEN] += (x - y) * d.gain * Math.exp(-t * d.decay) * vol;
    }
  }

  function play(n: Note) {
    const inst = instruments[n.instrument];
    if (!inst) throw new Error(`score: unknown instrument "${n.instrument}"`);
    const t0 = n.beat * beat + (n.delay ?? 0);
    const held = n.dur * beat * (n.gate ?? 1);
    if (inst.kind === "tone") tone(t0, held, n.vol, inst, mtof(n.pitch!));
    else if (inst.kind === "pluck") pluck(t0, held, n.vol, inst, mtof(n.pitch!));
    else if (inst.kind === "fm") fm(t0, held, n.vol, inst, mtof(n.pitch!));
    else if (inst.kind === "noise") chipNoise(Math.round(t0 * MSR), inst, n.vol);
    else if (inst.kind === "kick") kick(Math.round(t0 * MSR), inst, n.vol);
    else if (inst.kind === "snare") snare(Math.round(t0 * MSR), inst, n.vol);
    else hat(Math.round(t0 * MSR), inst, n.vol);
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
  for (let i = 0; i < LEN; i++) out[i] = steps ? Math.round(out[i] * g * steps) / steps : out[i] * g;
  return out;
}
