// What the audio system needs from a playback backend. The only implementation that knows about howler.js
// is howlerOut.ts; tests use an in-memory one. Samples are mono floats, sound is created from them once.

/** A short sound that can overlap itself (up to `voices` times). */
export interface SoundHandle {
  play(volume: number, rate: number): void;
}

/** A looping sound with at most one running copy: `play` resumes or does nothing, never stacks a second one. */
export interface LoopHandle {
  /** start, or resume after `pause`; does nothing while it is already playing */
  play(): void;
  pause(): void;
  /** stop and forget the position: the next `play` starts from the beginning */
  stop(): void;
  setVolume(v: number): void;
  isPlaying(): boolean;
  /** how many copies are actually sounding right now (1 while playing; used to prove nothing doubles) */
  copies(): number;
}

export interface AudioOut {
  /** false when there is no backend (howler.js did not load): the game stays silent */
  readonly available: boolean;
  setMuted(muted: boolean): void;
  loadSound(samples: Float32Array, sampleRate: number, opts: { volume: number; voices: number }): SoundHandle;
  /** `fadeEdges` softens the loop seam with a short fade; leave it off for music that loops seamlessly */
  loadLoop(samples: Float32Array, sampleRate: number, opts: { volume: number; fadeEdges?: boolean }): LoopHandle;
  /** Browsers start audio only after a gesture: `cb` runs on every click/key press, after the backend resumed. */
  onUserGesture(cb: () => void): void;
}

/** Minimal persistent key-value store (localStorage, or memory in tests). Must never throw. */
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}
