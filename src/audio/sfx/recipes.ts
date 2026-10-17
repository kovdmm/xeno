// Sound-effect recipes: each is a duration and a function that produces one sample of the sound from the time
// `t` (seconds) and a small per-sound state `s`. Pure DSP: no playback, no mixing rules, no game events.
// Randomness (noise) comes from the injected generator, so a seeded one gives identical sounds.
import { TWO_PI, sq, sweep } from "../dsp";
import type { Rng } from "../../game/types";

/** the sample rate the effects are synthesised at */
export const SFX_RATE = 22050;

export type SoundState = Record<string, number>;
export type Recipe = [duration: number, sample: (t: number, s: SoundState) => number];

/** Renders a recipe into samples. */
export function synth([dur, fn]: Recipe, rate = SFX_RATE): Float32Array {
  const n = Math.floor(rate * dur),
    a = new Float32Array(n),
    st: SoundState = {};
  for (let i = 0; i < n; i++) a[i] = fn(i / rate, st);
  return a;
}

export function createRecipes(rand: Rng): Record<string, Recipe> {
  const SR = SFX_RATE;
  const rnd = () => rand() * 2 - 1;
  // one-pole low-pass helper kept in per-sound state
  const lp = (st: SoundState, k: number, x: number, key = "y") => (st[key] = (st[key] || 0) + k * (x - (st[key] || 0)));
  // phase accumulator for glides
  const ph = (st: SoundState, f: number, key = "p") => (st[key] = (st[key] || 0) + (TWO_PI * f) / SR);

  return {
    gun: [
      0.07,
      (t, s) => lp(s, 0.5, rnd()) * Math.exp(-t * 70) * 0.7 + Math.sin(ph(s, 1400)) * Math.exp(-t * 90) * 0.25,
    ],
    cannon: [
      0.35,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 130, 45, 0.25))) * Math.exp(-t * 9) * 0.9 +
        lp(s, 0.12, rnd()) * Math.exp(-t * 22) * 1.2,
    ],
    missile: [
      0.45,
      (t, s) =>
        lp(s, 0.25, rnd()) * Math.min(1, t * 20) * Math.exp(-t * 6) * 0.9 +
        Math.sin(ph(s, sweep(t, 300, 700, 0.4))) * Math.exp(-t * 7) * 0.15,
    ],
    plasma: [0.25, (t, s) => (((ph(s, sweep(t, 900, 180, 0.22)) / TWO_PI) % 1) * 2 - 1) * Math.exp(-t * 12) * 0.45],
    rail: [
      0.4,
      (t, s) => rnd() * Math.exp(-t * 45) * 0.8 + Math.sin(ph(s, sweep(t, 3200, 400, 0.35))) * Math.exp(-t * 7) * 0.3,
    ],
    arty: [
      0.6,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 95, 30, 0.5))) * Math.exp(-t * 6) * 1 + lp(s, 0.08, rnd()) * Math.exp(-t * 12) * 1.5,
    ],
    frost: [
      0.5,
      (t, s) =>
        (Math.sin(t * TWO_PI * 1800) + Math.sin(t * TWO_PI * 2400) * 0.7 + Math.sin(t * TWO_PI * 3150) * 0.5) *
        Math.exp(-t * 6) *
        (0.7 + 0.3 * Math.sin(t * 60)) *
        0.18,
    ],
    freeze: [
      0.6,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 2600, 700, 0.5))) * Math.exp(-t * 4) * 0.3 +
        (rand() < 0.02 ? rnd() * 0.6 : 0) * Math.exp(-t * 3),
    ],
    boom: [
      0.4,
      (t, s) => lp(s, 0.15, rnd()) * Math.exp(-t * 9) * 1.3 + Math.sin(t * TWO_PI * 70) * Math.exp(-t * 12) * 0.5,
    ],
    bigboom: [
      0.9,
      (t, s) =>
        lp(s, 0.08, rnd()) * Math.exp(-t * 4.5) * 1.8 + Math.sin(ph(s, sweep(t, 60, 35, 0.6))) * Math.exp(-t * 5) * 0.7,
    ],
    nuke: [
      2.4,
      (t, s) => {
        const r = lp(s, 0.04, rnd(), "a");
        return (r * 2.6 + Math.sin(ph(s, sweep(t, 45, 25, 2))) * 0.8) * Math.min(1, t * 15) * Math.exp(-t * 1.5);
      },
    ],
    pop: [
      0.12,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 520, 140, 0.1))) * Math.exp(-t * 30) * 0.5 +
        lp(s, 0.4, rnd()) * Math.exp(-t * 50) * 0.2,
    ],
    bosskill: [
      1,
      (t, s) =>
        sq(ph(s, sweep(t, 320, 50, 0.9))) * Math.exp(-t * 3) * 0.25 + lp(s, 0.1, rnd()) * Math.exp(-t * 4) * 1.2,
    ],
    leak: [
      0.4,
      (t, s) => sq(t * TWO_PI * (t < 0.18 ? 880 : 660)) * (t < 0.16 || t > 0.2 ? 1 : 0) * Math.exp(-t * 2) * 0.22,
    ],
    wave: [
      0.8,
      (t, s) => {
        const v = 1 + 0.01 * Math.sin(t * 35),
          a = Math.min(1, t * 12) * Math.exp(-Math.max(0, t - 0.45) * 8);
        return (
          ((((t * 220 * v) % 1) * 2 - 1) * 0.35 + (((t * 330 * v) % 1) * 2 - 1) * 0.25) * lp(s, 0.3, 1, "e") * a * 0.6
        );
      },
    ],
    cleared: [
      0.55,
      (t, s) => {
        const f = t < 0.12 ? 660 : t < 0.24 ? 880 : 1320;
        return Math.sin(ph(s, f)) * Math.exp(-(t % 0.12 || 0) * 10) * Math.exp(-t * 2) * 0.35;
      },
    ],
    build: [0.1, (t, s) => rnd() * Math.exp(-t * 90) * 0.5 + Math.sin(t * TWO_PI * 1500) * Math.exp(-t * 60) * 0.3],
    upgrade: [0.3, (t, s) => Math.sin(ph(s, sweep(t, 500, 1300, 0.25))) * Math.exp(-t * 7) * 0.35],
    ult: [
      0.9,
      (t, s) => {
        const f = [523, 659, 784, 1047][Math.min(3, Math.floor(t / 0.12))];
        return (
          sq(ph(s, f)) * 0.12 * Math.exp(-(t % 0.12) * 6) * Math.exp(-Math.max(0, t - 0.36) * 3) +
          Math.sin(ph(s, f * 2, "q")) * 0.1 * Math.exp(-t * 2)
        );
      },
    ],
    sell: [0.25, (t, s) => Math.sin(ph(s, t < 0.08 ? 1300 : 1750)) * Math.exp(-(t % 0.08) * 25) * 0.35],
    error: [0.2, (t, s) => sq(t * TWO_PI * 140) * Math.exp(-t * 8) * 0.18],
    stasis: [
      1.1,
      (t, s) =>
        Math.sin(ph(s, sweep(t, 1400, 200, 1))) * Math.exp(-t * 2) * 0.3 +
        Math.sin(t * TWO_PI * 3000) * (0.5 + 0.5 * Math.sin(t * 40)) * Math.exp(-t * 3) * 0.06,
    ],
    meteorcast: [0.7, (t, s) => lp(s, sweep(t, 0.5, 0.05, 0.6), rnd()) * Math.min(1, t * 6) * Math.exp(-t * 3) * 1.2],
    fire: [
      0.9,
      (t, s) => (lp(s, 0.2, rnd()) * 0.6 + (rand() < 0.015 ? rnd() : 0)) * Math.min(1, t * 8) * Math.exp(-t * 2.5),
    ],
    plane: [
      1.8,
      (t, s) => {
        const a = Math.sin((Math.PI * t) / 1.8);
        return (lp(s, 0.1, rnd()) * 0.9 + Math.sin(ph(s, 105 + 15 * a)) * 0.3) * a * a;
      },
    ],
    siren: [
      1.5,
      (t, s) =>
        Math.sin(ph(s, 750 + 150 * Math.sin(t * TWO_PI * 2))) *
        Math.min(1, t * 10) *
        Math.exp(-Math.max(0, t - 1.1) * 8) *
        0.3,
    ],
    heal: [0.3, (t, s) => Math.sin(ph(s, sweep(t, 700, 1050, 0.25))) * Math.min(1, t * 30) * Math.exp(-t * 8) * 0.25],
    blink: [0.18, (t, s) => Math.sin(ph(s, sweep(t, 2200, 400, 0.15))) * Math.exp(-t * 18) * 0.3],
    victory: [
      1.6,
      (t, s) => {
        const f = [523, 659, 784, 1047, 1047][Math.min(4, Math.floor(t / 0.18))];
        return (
          (Math.sin(ph(s, f)) * 0.3 + sq(ph(s, f / 2, "q")) * 0.06) *
          Math.exp(-(t % 0.18) * 3) *
          Math.exp(-Math.max(0, t - 0.9) * 3)
        );
      },
    ],
    defeat: [
      1.6,
      (t, s) => {
        const f = [392, 349, 311, 233][Math.min(3, Math.floor(t / 0.3))];
        return (
          (Math.sin(ph(s, f)) * 0.3 + sq(ph(s, f / 2, "q")) * 0.07) *
          Math.exp(-(t % 0.3) * 2) *
          Math.exp(-Math.max(0, t - 1.2) * 4)
        );
      },
    ],
    laser: [
      1,
      (t, s) =>
        (Math.sin(t * TWO_PI * 220) * 0.4 +
          Math.sin(t * TWO_PI * 440) * 0.2 +
          Math.sin(t * TWO_PI * 110) * 0.25 +
          lp(s, 0.3, rnd()) * 0.08) *
        0.5,
    ],
  };
}
