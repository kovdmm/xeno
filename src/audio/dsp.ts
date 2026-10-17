// Small signal helpers shared by the music renderer and the sound-effect recipes.

/** 2π as the sounds were tuned with it (4 digits); changing it would detune every effect slightly. */
export const TWO_PI = 6.2832;

/** MIDI note number → frequency in Hz (A4 = 69 = 440 Hz). */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

/** triangle wave, x in cycles, range -1..1 */
export const tri = (x: number): number => 4 * Math.abs(x - Math.floor(x + 0.5)) - 1;

/** pulse wave with duty cycle d, x in cycles */
export const pulse = (x: number, d: number): number => (x - Math.floor(x) < d ? 1 : -1);

/** square wave, f in radians */
export const sq = (f: number): number => (Math.sin(f) > 0 ? 1 : -1);

/** exponential frequency glide from f0 to f1 over d seconds */
export const sweep = (t: number, f0: number, f1: number, d: number): number =>
  f0 * Math.pow(f1 / f0, Math.min(1, t / d));
