// Quality governor: measures real frame time and steps between three levels (backing-store size, glow and
// particle budgets), so weak phones stay smooth and strong ones look their best.

export interface QualityLevel {
  /** backing store size cap, pixels */
  px: number;
  /** glows per frame */
  glow: number;
  /** particles alive at once */
  fx: number;
  /** cosmetic particles (sparks, smoke) alive at once */
  cos: number;
}

export const QUALITY_LEVELS: readonly QualityLevel[] = [
  { px: 1.0e6, glow: 35, fx: 140, cos: 60 },
  { px: 1.4e6, glow: 80, fx: 260, cos: 160 },
  { px: 1.8e6, glow: 150, fx: 380, cos: 240 },
];

export class QualityGovernor {
  level = 2;
  private acc = 0;
  private n = 0;
  private good = 0;
  private last = 0;

  get settings(): QualityLevel {
    return QUALITY_LEVELS[this.level];
  }

  /** Call once per frame with the current time in ms. Returns true when the level changed. */
  tick(now: number): boolean {
    if (this.last) {
      const d = now - this.last;
      if (d < 250) {
        this.acc += d;
        this.n++;
      }
    }
    this.last = now;
    if (this.n < 90) return false;
    const avg = this.acc / this.n;
    this.acc = this.n = 0;
    if (avg > 24 && this.level > 0) {
      this.level--;
      this.good = 0;
      return true;
    }
    if (avg < 13 && this.level < 2) {
      if (++this.good >= 4) {
        this.level++;
        this.good = 0;
        return true;
      }
    } else this.good = 0;
    return false;
  }
}
