// In an installed Android app, pulling in the system bar changes the window height for a moment: the layout
// would be measured again and the field rebuilt on every frame of the animation. This keeps the layout at the
// tallest height seen for the current width, so the bar simply covers the bottom edge while it is open.
// A new width (the device was turned) starts over, and so does `reset()` (fullscreen changed the real size).

export function createStableHeight(apply: (px: number | null) => void) {
  let width = 0;
  let tallest = 0;
  return {
    /** Call on every window resize. `enabled` is false where the browser's own bars must be able to shrink the page. */
    update(w: number, h: number, enabled: boolean) {
      if (!enabled) {
        width = 0;
        apply(null);
        return;
      }
      if (w !== width) {
        width = w;
        tallest = h;
      } else tallest = Math.max(tallest, h);
      apply(tallest);
    },
    /** The window really changed size: forget the tallest height. */
    reset() {
      width = 0;
    },
  };
}
