// Full-screen effects drawn in screen space, over everything else.
import { alpha } from "../color";
import { THEME } from "../theme";
import type { Layer } from "../types";

/** A blue tint while time is stopped. */
export const stasisTint: Layer = {
  id: "stasisTint",
  draw({ ctx, canvas, world }) {
    const S = world.S;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (S.stasisT > 0) {
      ctx.fillStyle = alpha(THEME.ice, 0.1 * Math.min(1, S.stasisT));
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  },
};

/** The occasional flicker of a failing light. */
export const flicker: Layer = {
  id: "flicker",
  draw({ ctx, canvas, t }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const flick = 0.025 * (Math.sin(t * 23) * Math.sin(t * 7.3) > 0.6 ? 1 : 0);
    if (flick) {
      ctx.fillStyle = `rgba(0,0,0,${flick})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  },
};

/** The red vignette when an enemy gets through. */
export const leakVignette: Layer = {
  id: "leakVignette",
  draw({ ctx, canvas, fx }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.redFlash > 0) {
      const g = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        canvas.height * 0.3,
        canvas.width / 2,
        canvas.height / 2,
        canvas.width * 0.7,
      );
      g.addColorStop(0, "rgba(255,0,0,0)");
      g.addColorStop(1, `rgba(200,0,0,${0.55 * fx.redFlash})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  },
};

/** The white flash of a big explosion. */
export const whiteFlash: Layer = {
  id: "whiteFlash",
  draw({ ctx, canvas, fx }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,240,220,${fx.flash * 0.55})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  },
};
