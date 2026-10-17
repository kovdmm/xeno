// Volume and mute, remembered between visits.
import type { KeyValueStore } from "./out";

export interface AudioSettings {
  muted: boolean;
  /** effects volume 0..1 */
  volume: number;
  /** music volume 0..1 */
  musicVolume: number;
}

const KEYS = { muted: "xt-mute", volume: "xt-vol", musicVolume: "xt-mvol" } as const;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Reads saved settings; anything missing or garbled falls back to the default (0.7 effects, 0.5 music). */
export function loadSettings(store: KeyValueStore): AudioSettings {
  const num = (key: string, dflt: number) => {
    const v = clamp01(+(store.get(key) ?? dflt));
    return isNaN(v) ? dflt : v;
  };
  return {
    muted: store.get(KEYS.muted) === "1",
    volume: num(KEYS.volume, 0.7),
    musicVolume: num(KEYS.musicVolume, 0.5),
  };
}

export function saveSetting(store: KeyValueStore, name: keyof AudioSettings, value: boolean | number): void {
  store.set(KEYS[name], typeof value === "boolean" ? (value ? "1" : "0") : String(value));
}
