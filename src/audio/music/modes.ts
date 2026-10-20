// Sound modes: how a song is rendered and which instruments it may use. A song names its mode ("sound"); the mode
// fixes the sample rate, how coarsely the loudness is rounded and whether a track plays one note at a time.
//   lofi   the game's console sound: 16 kHz, loudness in 40 steps (the default: songs without "sound" are lofi)
//   chip   an 8-bit chip: 22 kHz, 16 loudness steps, every track is a channel that plays one note at a time
//   clean  full-band: 32 kHz, no rounding: plucked strings, FM keys, pads, proper drums

export type SoundMode = "lofi" | "chip" | "clean";

export interface ModeInfo {
  label: string;
  /** samples per second of the rendered loop */
  sampleRate: number;
  /** the loudness is rounded to this many steps per unit (0: not rounded) */
  crushSteps: number;
  /** the loop is scaled down to peak at this level when it would be louder */
  headroom: number;
  /** a pitched track plays one note at a time: a new note cuts the one before it, of two at once the higher stays */
  monophonic: boolean;
  /** one line for the person choosing */
  about: string;
}

export const MODES: Record<SoundMode, ModeInfo> = {
  lofi: { label: "Lo-fi", sampleRate: 16000, crushSteps: 40, headroom: 0.8, monophonic: false, about: "console sound: pulse and triangle waves, noise drums (the game's own)" },
  chip: { label: "8-bit chip", sampleRate: 22050, crushSteps: 16, headroom: 0.8, monophonic: true, about: "like an NES: 16 loudness steps, 4-bit triangle, a channel plays one note at a time" },
  clean: { label: "Clean", sampleRate: 32000, crushSteps: 0, headroom: 0.8, monophonic: false, about: "full sound: guitars, keys, strings, pads and a proper drum kit" },
};

export const MODE_NAMES = Object.keys(MODES) as SoundMode[];
export const DEFAULT_MODE: SoundMode = "lofi";
export const isMode = (v: unknown): v is SoundMode => typeof v === "string" && v in MODES;
/** the mode of a song (songs that do not say are lofi) */
export const modeOf = (song: { sound?: SoundMode }): SoundMode => song.sound ?? DEFAULT_MODE;
