// Plays the music loop: builds it once, keeps exactly one copy running whatever the volume does, and pauses
// instead of stopping at volume 0 so it resumes where it was.
import type { AudioOut, LoopHandle } from "../out";

/**
 * Music is a background: it must never ask to be turned down. The loop is mixed loud on purpose (a full-scale
 * lo-fi chiptune), so at the slider's default (0.5) it plays at a few percent of full scale, far under the effects;
 * the top of the slider is still quieter than the old default.
 */
export const MUSIC_GAIN = 0.05;

export class MusicPlayer {
  private loop: LoopHandle | null = null;

  constructor(
    private out: AudioOut,
    /** produces the loop's samples; called once, the first time the loop is needed */
    private makeSamples: () => Float32Array,
    private sampleRate: number,
    /** the current music volume 0..1 */
    private volume: () => number,
    /** the player's own gain on top of the volume slider: see MUSIC_GAIN */
    private gain = MUSIC_GAIN,
  ) {}

  /** Composes and loads the loop (once) and starts it if the volume allows. */
  build(): void {
    if (this.loop) return;
    this.loop = this.out.loadLoop(this.makeSamples(), this.sampleRate, { volume: this.volume() * this.gain });
    this.start();
  }

  /** Starts or resumes; a no-op while already playing, so repeated calls never stack copies. */
  start(): void {
    if (!this.loop || this.volume() <= 0) return;
    this.loop.setVolume(this.volume() * this.gain);
    this.loop.play();
  }

  /** Call after the volume changed. */
  volumeChanged(): void {
    if (!this.loop) return;
    this.loop.setVolume(this.volume() * this.gain);
    if (this.volume() <= 0) this.loop.pause();
    else this.start();
  }

  playing(): boolean {
    return !!this.loop && this.loop.isPlaying();
  }

  /** How many copies sound right now (must never exceed 1). */
  copies(): number {
    return this.loop ? this.loop.copies() : 0;
  }
}
