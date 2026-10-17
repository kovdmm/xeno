// Turns what happens in the game (events) into what the player sees: particles, decals, shake, flashes.
// Pure calculation: all drawing is done by layers.
import type { GameEvent } from "../game/types";
import { THEME } from "./theme";
import type { Fx } from "./fx";
import type { Floor } from "./floor";

export function createFxDirector(fx: Fx, floor: Floor) {
  return (e: GameEvent) => {
    switch (e.type) {
      case "built":
      case "upgraded":
      case "sold":
        floor.towersDirty = true;
        break;
      case "reset":
        floor.towersDirty = true;
        fx.reset();
        floor.clearDecals();
        break;
      case "shot": {
        fx.kick.set(e.tower, 1);
        const t = e.tower;
        if (t.type !== "frost" && t.type !== "laser") {
          const L = t.size > 1 ? 0.95 : 0.45;
          fx.add({
            k: "muzzle",
            x: t.x + Math.cos(t.ang) * L,
            y: t.y + Math.sin(t.ang) * L,
            col: THEME.tower[t.type],
            life: 0.08,
            max: 0.08,
            r: t.size > 1 ? 0.6 : 0.32,
          });
        }
        break;
      }
      case "kill": {
        const c = e.creep,
          b = c.boss;
        floor.splat(e.x, e.y, THEME.blood[c.type], b ? 1.4 : c.r * 1.6);
        fx.sparks(e.x, e.y, b ? 26 : 6, THEME.enemy[c.type], 1, b ? 5 : 3, 0.5, b ? 0.09 : 0.06);
        if (b) {
          fx.blast(e.x, e.y, 1.4, THEME.enemy[c.type], 0.6);
          fx.addShake(0.25);
        }
        if (fx.texts.length < 26) fx.texts.push({ x: e.x, y: e.y, v: "+" + c.rw, life: 0.9, max: 0.9 });
        break;
      }
      case "leak":
        fx.redFlash = Math.min(1, fx.redFlash + (e.creep.boss ? 0.9 : 0.35));
        fx.addShake(e.creep.boss ? 0.3 : 0.08);
        break;
      case "pulse":
        fx.add({
          k: "ring",
          x: e.tower.x,
          y: e.tower.y,
          r: e.r,
          life: 0.5,
          max: 0.5,
          col: e.freeze ? THEME.white : THEME.ice,
          w: e.freeze ? 0.08 : 0.04,
        });
        break;
      case "heal":
        fx.add({
          k: "ring",
          x: e.x,
          y: e.y,
          r: e.r,
          life: 0.4,
          max: 0.4,
          col: THEME.enemy.healer,
          w: 0.03,
        });
        break;
      case "blink":
        fx.add({
          k: "zap",
          x: e.x,
          y: e.y,
          x2: e.x2,
          y2: e.y2,
          life: 0.2,
          max: 0.2,
          col: THEME.enemy.blinker,
        });
        break;
      case "rail":
        fx.add({
          k: "rail",
          x: e.x,
          y: e.y,
          x2: e.x2,
          y2: e.y2,
          life: 0.3,
          max: 0.3,
          col: THEME.tower.rail,
          w: e.width * (e.big ? 1.4 : 1),
        });
        break;
      case "muzzle":
        fx.kick.set(e.tower, 1);
        fx.add({
          k: "muzzle",
          x: e.x,
          y: e.y,
          col: THEME.accent,
          life: 0.12,
          max: 0.12,
          r: 0.7,
        });
        fx.smoke(e.x, e.y, 2, 0.4);
        break;
      case "cast":
        if (e.ability === "stasis") fx.flash = Math.max(fx.flash, 0.25);
        break;
      case "explode": {
        const K = e.kind,
          x = e.x,
          y = e.y;
        if (K === "shell" || K === "bomblet") {
          fx.blast(x, y, e.r, THEME.tower.cannon, 0.3);
          if (K === "shell") floor.scorch(x, y, e.r * 0.5);
        } else if (K === "missile") fx.blast(x, y, e.r, THEME.fire, 0.3);
        else if (K === "plasma") {
          fx.add({
            k: "blast",
            x,
            y,
            r: e.r + 0.2,
            col: THEME.tower.plasma,
            life: 0.3,
            max: 0.3,
          });
          fx.sparks(x, y, 4, THEME.tower.plasma, 1, 2.5, 0.3);
        } else if (K === "artillery") {
          fx.blast(x, y, e.r, THEME.fire, 0.5);
          floor.scorch(x, y, e.r * 0.7);
          fx.addShake(0.06);
        } else if (K === "nukeShell") {
          fx.blast(x, y, e.r, THEME.fire, 0.9, 0.3);
          floor.scorch(x, y, e.r);
          fx.addShake(0.25);
          fx.sparks(x, y, 20, THEME.accent, 2, 6, 0.7, 0.08);
        } else if (K === "meteor") {
          fx.blast(x, y, e.r, THEME.fire, 0.45);
          floor.scorch(x, y, e.r * 0.6);
          fx.sparks(x, y, 6, THEME.accent, 1, 3, 0.4);
          fx.addShake(0.05);
        } else if (K === "bomb") {
          fx.blast(x, y, e.r, THEME.accent, 0.4);
          floor.scorch(x, y, e.r * 0.5);
          fx.addShake(0.03);
        } else if (K === "nuke") {
          fx.flash = 1;
          fx.addShake(0.6);
          floor.scorch(x, y, e.r * 1.1);
          fx.add({
            k: "blast",
            x,
            y,
            r: e.r * 1.2,
            col: THEME.fire,
            life: 1.4,
            max: 1.4,
          });
          fx.add({
            k: "ring",
            x,
            y,
            r: e.r * 1.8,
            life: 1,
            max: 1,
            col: THEME.white,
            w: 0.12,
          });
          fx.sparks(x, y, 50, THEME.accent, 1, 7, 1, 0.1);
          fx.smoke(x, y, 14, e.r);
        }
        break;
      }
    }
  };
}
