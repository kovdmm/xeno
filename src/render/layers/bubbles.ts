import type { Layer } from "../types";

/** Speech bubbles over the enemies (cheat "crazytown"). */
export const bubbles: Layer = {
  id: "bubbles",
  draw(fc) {
    const { ctx, sprites, fx, world } = fc;
    for (const b of fx.bubbles) {
      const w = 0.6 + 0.2 * b.v.length,
        lab = sprites.sprite("bb|" + b.v, w + 0.2, (c) => {
          c.font = '.3px "Russo One",sans-serif';
          c.textAlign = "center";
          c.textBaseline = "middle";
          const tw = c.measureText(b.v).width + 0.3;
          c.fillStyle = "rgba(255,255,255,.92)";
          c.strokeStyle = "#000";
          c.lineWidth = 0.04;
          c.beginPath();
          c.rect(-tw / 2, -0.22, tw, 0.44);
          c.fill();
          c.stroke();
          c.fillStyle = "#111";
          c.fillText(b.v, 0, 0.02);
        });
      const [x, y] = world.pos(b.creep);
      ctx.globalAlpha = Math.min(1, (b.life / b.max) * 3, (b.max - b.life) * 8 + 0.2);
      sprites.blitUp(ctx, lab, x + 0.5, y - b.creep.r - 0.2);
    }
    ctx.globalAlpha = 1;
  },
};
