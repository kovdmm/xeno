import type { Creep } from "../../game/types";
import { alienVector } from "../aliens";
import { alpha } from "../color";
import { TAU, THEME } from "../theme";
import type { FrameContext, Layer } from "../types";

function drawCreep(fc: FrameContext, c: Creep) {
  const { ctx, world: C, t, sprites, glows } = fc;
  const [px, py] = C.pos(c),
    x = px + 0.5,
    y = py + 0.5,
    r = c.r,
    ph = (c.id * 2.399) % TAU;
  const fr = ((t * 8 + ph) | 0) % 4;
  const size = r * (c.boss ? 3.4 : c.fly ? 3.6 : 3);
  const ang = c.fly ? Math.atan2(c.gy - c.y, c.gx - c.x) : c.ang;
  const s = sprites.rsprite("e|" + c.type + "|" + fr + "|" + r, size, ang, (cc) => alienVector(cc, c.type, r, fr));
  if (!c.fly)
    sprites.blit(
      ctx,
      sprites.sprite("sh|" + r, r * 2.4, (cc) => {
        cc.fillStyle = "rgba(0,0,0,.38)";
        cc.beginPath();
        cc.ellipse(0, 0, r * 1.05, r * 0.8, 0, 0, TAU);
        cc.fill();
      }),
      x - 0.03,
      y + 0.06,
    );
  if (c.fly) {
    ctx.fillStyle = "rgba(0,0,0,.4)";
    ctx.beginPath();
    ctx.ellipse(x + 0.18, y + 0.3, r * 0.9, r * 0.45, 0, 0, TAU);
    ctx.fill();
  }
  if (c.type === "healer" || c.boss) {
    ctx.globalCompositeOperation = "lighter";
    glows.add(ctx, c.boss ? THEME.hiveGlow : THEME.enemy.healer, x, y, r * 2.2, 0.25 + 0.1 * Math.sin(t * 5 + ph));
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
  }
  sprites.blit(ctx, s, x, y);
  if (c.stunT > 0) {
    ctx.strokeStyle = alpha(THEME.white, 0.9);
    ctx.lineWidth = 0.04;
    for (let i = 0; i < 3; i++) {
      const a = t * 6 + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.9, y - r * 0.9 + Math.sin(a) * r * 0.25, 0.05, 0, TAU);
      ctx.stroke();
    }
  } else if (c.slowT > 0) {
    ctx.fillStyle = alpha(THEME.ice, 0.22);
    ctx.beginPath();
    ctx.arc(x, y, r * 1.05, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = alpha(THEME.ice, 0.7);
    ctx.lineWidth = 0.025;
    ctx.stroke();
  }
  if (c.vulnT > 0) {
    ctx.strokeStyle = alpha(THEME.bad, 0.8);
    ctx.lineWidth = 0.03;
    ctx.setLineDash([0.06, 0.06]);
    ctx.beginPath();
    ctx.arc(x, y, r + 0.13, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (c.hp < c.max) {
    const bw = Math.max(0.42, r * 2),
      by = y - r - 0.2,
      p = Math.max(0, c.hp / c.max);
    ctx.fillStyle = "#000";
    ctx.fillRect(x - bw / 2 - 0.02, by - 0.02, bw + 0.04, 0.11);
    ctx.fillStyle = "#3a0606";
    ctx.fillRect(x - bw / 2, by, bw, 0.07);
    ctx.fillStyle = p > 0.5 ? "#5ee04a" : p > 0.25 ? THEME.accent : THEME.bad;
    ctx.fillRect(x - bw / 2, by, bw * p, 0.07);
    ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.fillRect(x - bw / 2, by, bw * p, 0.02);
  }
}

/** Ground enemies, with shadow, status effects and health bar. */
export const groundCreeps: Layer = {
  id: "groundCreeps",
  draw(fc) {
    for (const c of fc.world.S.creeps) if (!c.fly) drawCreep(fc, c);
  },
};

/** Flyers: above the shots, with a shadow offset on the ground. */
export const airCreeps: Layer = {
  id: "airCreeps",
  draw(fc) {
    for (const c of fc.world.S.creeps) if (c.fly) drawCreep(fc, c);
  },
};
