// The effects, created on first use (or in the background by `warmUp`): synthesising all of them up front
// would stall the first frame.
import type { AudioOut, SoundHandle } from "../out";
import type { MixRule } from "./mixRules";
import { SFX_RATE, synth, type Recipe } from "./recipes";

export class SoundBank {
  private handles = new Map<string, SoundHandle>();

  constructor(
    private out: AudioOut,
    private recipes: Record<string, Recipe>,
    private rules: Record<string, MixRule>,
  ) {}

  /** The sound called `name`, built if this is the first time it is needed. */
  get(name: string): SoundHandle {
    let h = this.handles.get(name);
    if (!h) {
      const rule = this.rules[name];
      h = this.out.loadSound(synth(this.recipes[name]), SFX_RATE, { volume: rule.volume, voices: rule.voices });
      this.handles.set(name, h);
    }
    return h;
  }

  /** Names of the sounds built so far. */
  built(): string[] {
    return [...this.handles.keys()];
  }

  /** Builds the remaining sounds one at a time, each in its own task, so no frame is blocked for long. */
  warmUp(schedule: (fn: () => void, ms: number) => void): void {
    const names = Object.keys(this.rules);
    let i = 0;
    const next = () => {
      while (i < names.length && this.handles.has(names[i])) i++;
      if (i >= names.length) return;
      this.get(names[i++]);
      schedule(next, 0);
    };
    schedule(next, 0);
  }
}
