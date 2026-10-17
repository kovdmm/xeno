// The mixer decides which of the requested sounds actually play, and how loud. It is pure: no backend, no
// timers; it is given the clock and a random generator. That keeps a late wave from turning into noise:
//  - requests collected during a frame are flushed once per frame; same-name requests merge and get
//    louder by the log of their count instead of stacking;
//  - every sound has a minimum interval;
//  - low-priority combat sounds share a budget per 100 ms and get quieter as the field gets busier;
//  - important sounds bypass the budget.
import type { Rng } from "../../game/types";
import { LOW_BUDGET, type MixRule } from "./mixRules";

export interface PlayCommand {
  name: string;
  /** 0..1, before the master effects volume */
  volume: number;
  /** playback speed, slightly randomised so repeats do not sound identical */
  rate: number;
}

export class Mixer {
  /** how many times each sound was let through (for tests and debugging) */
  readonly stats: Record<string, number> = {};
  private pending = new Map<string, number>();
  private last: Record<string, number> = {};
  private budgetStart = 0;
  private budget = 0;
  private busy = 0;

  constructor(
    private rules: Record<string, MixRule>,
    private rand: Rng,
    private lowBudget = LOW_BUDGET,
  ) {}

  /** Asks for a sound this frame; `n` merges repeated requests. Unknown names are ignored. */
  request(name: string, n = 1): void {
    if (!(name in this.rules)) return;
    this.pending.set(name, (this.pending.get(name) || 0) + n);
  }

  /** Forgets everything requested so far (pause, new game). */
  clear(): void {
    this.pending.clear();
  }

  /** Decides this frame: returns what to play, most important first. `now` is the audio clock in seconds. */
  flush(now: number): PlayCommand[] {
    if (now - this.budgetStart > 0.1) {
      this.budgetStart = now;
      this.budget = 0;
    }
    this.busy *= 0.9;
    const items = [...this.pending.entries()].sort((a, b) => this.rules[b[0]].priority - this.rules[a[0]].priority);
    this.pending.clear();
    const out: PlayCommand[] = [];
    for (const [name, n] of items) {
      const { volume, gap, priority } = this.rules[name];
      if (gap && now - (this.last[name] || -9) < gap) continue; // too soon: merged into the next play
      if (priority === 0) {
        if (this.budget >= this.lowBudget) continue;
        this.budget++;
        this.busy += n;
      }
      this.last[name] = now;
      this.stats[name] = (this.stats[name] || 0) + 1;
      // louder for merged requests, quieter when the field is busy
      const boost = Math.min(1.6, 1 + 0.25 * Math.log2(n));
      const duck = priority === 0 ? 1 / Math.sqrt(1 + this.busy / 8) : 1;
      out.push({ name, volume: Math.min(1, volume * boost * duck), rate: 0.92 + this.rand() * 0.16 });
    }
    return out;
  }
}
