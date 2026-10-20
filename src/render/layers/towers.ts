import type { Tower } from "../../game/types";
import { TAU, THEME } from "../theme";
import { leftMark, markText, rightMark } from "../marks";
import { tierColor } from "../tiers";
import { towerBase, towerTurret } from "../towers";
import type { Ctx, FrameContext, Layer } from "../types";

/** Which specialisation of its type a tower took (-1 before level 5): the order in the data picks the colour. */
export const specOf = (f: FrameContext, tw: Pick<Tower, "type" | "lvl" | "ult">) =>
  tw.lvl >= 4 && tw.ult ? Object.keys(f.world.TT[tw.type].ults).indexOf(tw.ult) : -1;

/** The static part of a tower, the plate with its diodes and the overclock label. It goes onto the floor. */
export function drawTowerBase(f: FrameContext, tw: Tower, c2: Ctx) {
  const { sprites } = f,
    ult = tw.lvl >= 4 ? tw.ult : "",
    spec = specOf(f, tw),
    z = tw.size || 1,
    cx = tw.x + 0.5,
    cy = tw.y + 0.5;
  const base = sprites.sprite("b|" + tw.type + "|" + Math.min(tw.lvl, 4) + "|" + ult + "|" + z, z * 1.35, (c) => {
    if (z > 1) c.scale(z, z);
    c.fillStyle = "rgba(0,0,0,.45)";
    c.beginPath();
    c.ellipse(0.06, 0.1, 0.46, 0.42, 0, 0, TAU);
    c.fill();
    towerBase(c, tw.type, tw.lvl, spec);
  });
  sprites.blit(c2, base, cx, cy);
  if (tw.oc) {
    const lab = sprites.sprite("oc|" + tw.oc + "|" + z, 0.5 * z, (c) => {
      c.font = `${0.24 * z}px "Russo One",sans-serif`;
      c.textAlign = "center";
      c.textBaseline = "middle";
      c.lineWidth = 0.06 * z;
      c.strokeStyle = "#000";
      c.lineJoin = "round";
      c.strokeText("+" + tw.oc, 0, 0);
      c.fillStyle = THEME.accent;
      c.fillText("+" + tw.oc, 0, 0);
    });
    sprites.blitUp(c2, lab, cx + 0.3 * z, cy + 0.32 * z, 0, 0);
  }
}

/**
 * The letter marks, drawn over the turrets: the type or specialisation letter at the screen-left of the plate and
 * "+n" at the screen-right. They stay upright when the field is turned in portrait, so the offsets are screen ones.
 */
export function drawTowerMarks(f: FrameContext) {
  const { ctx, sprites, proj } = f;
  for (const tw of f.world.S.towers) {
    const z = tw.size || 1,
      L = Math.min(tw.lvl, 4),
      ult = L >= 4 ? tw.ult : "",
      cx = tw.x + 0.5,
      cy = tw.y + 0.5,
      dy = 0.33 * z;
    const put = (text: string, fill: string, dx: number) => {
      const s = sprites.sprite("m|" + text + "|" + fill + "|" + z, 0.7 * z, (c) => markText(c, text, fill, z));
      // screen right is field +x in landscape and field -y in portrait; screen down is field +y or +x
      if (proj.rot) sprites.blitUp(ctx, s, cx + dy, cy - dx);
      else sprites.blit(ctx, s, cx + dx, cy + dy);
    };
    put(leftMark(tw.type, ult, L), "#f2efe6", -0.3 * z);
    const n = rightMark(L);
    if (n) put(n, tierColor(L, tw.type, specOf(f, tw)), 0.3 * z);
  }
}

/** The turrets: they turn and kick back when they fire. */
export const towers: Layer = {
  id: "towers",
  draw(f) {
    const { ctx, sprites, fx } = f;
    for (const tw of f.world.S.towers) {
      const z = tw.size || 1,
        cx = tw.x + 0.5,
        cy = tw.y + 0.5;
      const a = tw.type === "frost" ? 0 : tw.ang;
      const L = Math.min(tw.lvl, 4),
        tur = sprites.rsprite("t|" + tw.type + "|" + z + "|" + L, z * 1.1, a, (c) => {
          if (z > 1) c.scale(z, z);
          towerTurret(c, tw.type, L);
        });
      const k = (fx.kick.get(tw) || 0) * 0.08 * z;
      sprites.blit(ctx, tur, cx - Math.cos(a) * k, cy - Math.sin(a) * k);
    }
    drawTowerMarks(f);
  },
};
