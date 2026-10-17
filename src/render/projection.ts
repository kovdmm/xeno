// Board → screen. In portrait the board is turned 90° clockwise (board x runs down the screen,
// board y runs right-to-left) so it fills a tall screen. This is the only place that knows about it.
import type { Ctx } from "./types";

export class Projection {
  /** device pixels per board cell */
  cs = 1;
  rot = false;
  /** screen shake of the current frame, device pixels */
  ox = 0;
  oy = 0;

  constructor(
    public W: number,
    public H: number,
  ) {}

  /** The board changed size (another level). Returns true if it did, so the caller can rebuild what depends on it. */
  setBoard(W: number, H: number): boolean {
    if (W === this.W && H === this.H) return false;
    this.W = W;
    this.H = H;
    return true;
  }

  /** cells across / down the screen */
  get cols() {
    return this.rot ? this.H : this.W;
  }
  get rows() {
    return this.rot ? this.W : this.H;
  }

  /** Sets `c`'s matrix to board space (cells), optionally shifted by dx, dy device pixels. */
  apply(c: Ctx, dx = 0, dy = 0) {
    if (this.rot) c.setTransform(0, this.cs, -this.cs, 0, this.H * this.cs + dx, dy);
    else c.setTransform(this.cs, 0, 0, this.cs, dx, dy);
  }

  /** Where the board point (x, y) lands on the screen, in device pixels. */
  toScreen(x: number, y: number): [number, number] {
    return this.rot ? [(this.H - y) * this.cs, x * this.cs] : [x * this.cs, y * this.cs];
  }
}
