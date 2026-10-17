import { THEME } from "../theme";
import type { Layer } from "../types";

/** Floating +reward numbers. */
export const rewards: Layer = {
  id: "rewards",
  draw(fc) {
    const { ctx, sprites, fx } = fc;
    for (const tx of fx.texts) {
      const lab = sprites.sprite("tx|" + tx.v, 0.5 + 0.17 * tx.v.length, (c) => {
        c.font = '.3px "Russo One",sans-serif';
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.lineWidth = 0.07;
        c.strokeStyle = "#000";
        c.lineJoin = "round";
        c.strokeText(tx.v, 0, 0);
        c.fillStyle = THEME.accent;
        c.fillText(tx.v, 0, 0);
      });
      ctx.globalAlpha = Math.min(1, (tx.life / tx.max) * 1.6);
      sprites.blitUp(ctx, lab, tx.x + 0.5, tx.y + 0.2);
    }
    ctx.globalAlpha = 1;
  },
};
