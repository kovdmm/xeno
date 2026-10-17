// Painters of towers: base plate and turret, in unit-cell space (centred, facing +x). No state.
import { THEME, TAU, type TowerType } from "./theme";
import { alpha, mix, shade } from "./color";
import { type Ctx, gloss, oct, outline, rivet } from "./primitives";
import { tierColor } from "./tiers";

/* Towers grow and turn meaner with level: from a small grey pea-shooter at level 1
 to a spiked, red-lit monster filling the whole cell at level 5. */
const LV_K = [0.6, 0.7, 0.8, 0.9, 1.02];
export const lvK = (l: number) => LV_K[Math.min(l, 4)];
// type colour drifts toward a hot red and gains saturation with level, but keeps its identity
const lvCol = (type: TowerType, l: number) =>
  mix(THEME.tower[type], "#ff1e0a", [0, 0.1, 0.2, 0.3, 0.38][Math.min(l, 4)]);
const PLATE = [
  ["#8a847a", "#2e2b26"],
  ["#78716a", "#26221e"],
  ["#5e5650", "#1c1715"],
  ["#4c3a36", "#140c0b"],
  ["#3c2422", "#0c0505"],
];
export function towerBase(c: Ctx, type: TowerType, lvl: number, spec: number) {
  const L = Math.min(lvl, 4),
    col = lvCol(type, L),
    k = lvK(L);
  c.save();
  c.scale(k, k);
  // spikes from level 3
  if (L >= 2) {
    const sl = 0.08 + 0.05 * L;
    c.fillStyle = mix("#1c1a17", tierColor(L, type, spec), 0.22);
    c.strokeStyle = "#000";
    c.lineWidth = 0.025;
    for (let i = 0; i < 4; i++) {
      const a = TAU / 8 + (i * TAU) / 4;
      c.beginPath();
      c.moveTo(Math.cos(a - 0.22) * 0.44, Math.sin(a - 0.22) * 0.44);
      c.lineTo(Math.cos(a) * (0.46 + sl), Math.sin(a) * (0.46 + sl));
      c.lineTo(Math.cos(a + 0.22) * 0.44, Math.sin(a + 0.22) * 0.44);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
  oct(c, 0.47);
  c.fillStyle = gloss(c, -0.4, -0.4, 0.4, 0.4, PLATE[L][0], PLATE[L][1]);
  c.fill();
  outline(c, 0.045);
  // the level ring: thin on the steel tier, thick and lit from the third on
  oct(c, 0.455);
  c.strokeStyle = tierColor(L, type, spec);
  c.lineWidth = 0.02 + 0.012 * L;
  c.stroke();
  oct(c, 0.38);
  c.fillStyle = gloss(c, 0.3, 0.3, -0.3, -0.3, L >= 3 ? "#2e1c1a" : "#3a3631", L >= 3 ? "#0c0606" : "#151311");
  c.fill();
  c.strokeStyle = alpha(col, 0.35 + L * 0.12);
  c.lineWidth = 0.03;
  c.stroke();
  // type stripe and rivets
  c.fillStyle = alpha(col, 0.7);
  c.fillRect(-0.3, 0.33, 0.6, 0.04);
  for (const [x, y] of [
    [-0.33, -0.33],
    [0.33, -0.33],
    [-0.33, 0.33],
    [0.33, 0.33],
  ])
    rivet(c, x * 0.92, y * 0.92);
  // lights in the tier colour from level 4
  if (L >= 3)
    for (const x of [-0.36, 0.36]) {
      c.beginPath();
      c.arc(x, 0, 0.035, 0, TAU);
      c.fillStyle = tierColor(L, type, spec);
      c.fill();
      c.strokeStyle = "#000";
      c.lineWidth = 0.012;
      c.stroke();
    }
  // level diodes
  for (let i = 0; i <= L; i++) {
    const x = -0.2 + i * 0.1;
    c.beginPath();
    c.arc(x, -0.385, 0.028, 0, TAU);
    c.fillStyle = tierColor(L, type, spec);
    c.fill();
    c.strokeStyle = "#000";
    c.lineWidth = 0.012;
    c.stroke();
  }
  if (L >= 4) {
    oct(c, 0.43);
    c.strokeStyle = alpha(tierColor(L, type, spec), 0.55);
    c.lineWidth = 0.03;
    c.stroke();
    oct(c, 0.49);
    c.strokeStyle = alpha(tierColor(L, type, spec), 0.9);
    c.lineWidth = 0.018;
    c.stroke();
  }
  c.restore();
}
export function towerTurret(c: Ctx, type: TowerType, lvl = 0) {
  const L = Math.min(lvl, 4);
  c.save();
  c.scale(lvK(L), lvK(L));
  towerTurretBody(c, type, L);
  c.restore();
}
function towerTurretBody(c: Ctx, type: TowerType, L: number) {
  const col = lvCol(type, L),
    hi = shade(col, 0.45),
    lo = shade(col, -0.55),
    metal = gloss(c, 0, -0.15, 0, 0.15, "#7a746a", "#24211d");
  if (type === "gun") {
    for (const y of [-0.1, 0.06]) {
      c.beginPath();
      c.rect(0.02, y, 0.4, 0.065);
      c.fillStyle = metal;
      c.fill();
      outline(c, 0.025);
      c.fillStyle = col;
      c.fillRect(0.36, y + 0.012, 0.05, 0.04);
    }
    c.beginPath();
    c.arc(0, 0, 0.19, 0, TAU);
    c.fillStyle = gloss(c, -0.15, -0.15, 0.15, 0.15, hi, lo);
    c.fill();
    outline(c);
    c.beginPath();
    c.arc(-0.04, 0, 0.07, 0, TAU);
    c.fillStyle = "#111";
    c.fill();
  } else if (type === "cannon") {
    c.beginPath();
    c.rect(0, -0.085, 0.43, 0.17);
    c.fillStyle = metal;
    c.fill();
    outline(c);
    c.beginPath();
    c.rect(0.36, -0.11, 0.09, 0.22);
    c.fillStyle = "#2a2622";
    c.fill();
    outline(c, 0.025);
    c.beginPath();
    c.arc(-0.02, 0, 0.24, 0, TAU);
    c.fillStyle = gloss(c, -0.2, -0.2, 0.2, 0.2, hi, lo);
    c.fill();
    outline(c);
    c.beginPath();
    c.arc(-0.07, -0.07, 0.07, 0, TAU);
    c.fillStyle = "rgba(255,255,255,.25)";
    c.fill();
  } else if (type === "frost") {
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6;
      c[i ? "lineTo" : "moveTo"](Math.cos(a) * 0.26, Math.sin(a) * 0.26);
    }
    c.closePath();
    c.fillStyle = gloss(c, -0.2, -0.2, 0.2, 0.2, "#5b6f78", "#16242a");
    c.fill();
    outline(c);
    for (let i = 0; i < 6; i++) {
      const a = (i * TAU) / 6 + TAU / 12;
      c.beginPath();
      c.moveTo(Math.cos(a) * 0.1, Math.sin(a) * 0.1);
      c.lineTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3);
      c.lineTo(Math.cos(a + 0.25) * 0.16, Math.sin(a + 0.25) * 0.16);
      c.closePath();
      c.fillStyle = gloss(c, 0, -0.3, 0, 0.3, "#e8fbff", col);
      c.fill();
      outline(c, 0.018);
    }
    c.beginPath();
    c.arc(0, 0, 0.09, 0, TAU);
    c.fillStyle = "#eafcff";
    c.fill();
    outline(c, 0.02);
  } else if (type === "missile") {
    c.beginPath();
    c.rect(-0.22, -0.23, 0.46, 0.46);
    c.fillStyle = gloss(c, -0.2, -0.2, 0.2, 0.2, hi, lo);
    c.fill();
    outline(c);
    for (const [x, y] of [
      [0.06, -0.11],
      [0.06, 0.11],
      [-0.1, -0.11],
      [-0.1, 0.11],
    ]) {
      c.beginPath();
      c.arc(x, y, 0.065, 0, TAU);
      c.fillStyle = "#101010";
      c.fill();
      outline(c, 0.018);
      c.beginPath();
      c.arc(x + 0.015, y, 0.035, 0, TAU);
      c.fillStyle = "#ff3b3b";
      c.fill();
    }
  } else if (type === "laser") {
    c.beginPath();
    c.moveTo(0.4, 0);
    c.lineTo(0.02, 0.2);
    c.lineTo(-0.22, 0);
    c.lineTo(0.02, -0.2);
    c.closePath();
    c.fillStyle = gloss(c, -0.2, -0.2, 0.3, 0.2, "#5a5f5c", "#1a1d1b");
    c.fill();
    outline(c);
    c.beginPath();
    c.moveTo(0.32, 0);
    c.lineTo(0.05, 0.1);
    c.lineTo(-0.08, 0);
    c.lineTo(0.05, -0.1);
    c.closePath();
    c.fillStyle = gloss(c, 0, -0.1, 0, 0.1, hi, col);
    c.fill();
    outline(c, 0.02);
    c.beginPath();
    c.arc(0.05, 0, 0.045, 0, TAU);
    c.fillStyle = "#fff";
    c.fill();
  } else if (type === "plasma") {
    c.beginPath();
    c.rect(0.08, -0.075, 0.3, 0.15);
    c.fillStyle = metal;
    c.fill();
    outline(c);
    for (const x of [0.16, 0.24, 0.32]) {
      c.fillStyle = col;
      c.fillRect(x, -0.09, 0.03, 0.18);
    }
    c.beginPath();
    c.arc(0, 0, 0.21, 0, TAU);
    c.fillStyle = gloss(c, -0.2, -0.2, 0.2, 0.2, "#4a4f3a", "#151910");
    c.fill();
    outline(c);
    c.beginPath();
    c.arc(0, 0, 0.13, 0, TAU);
    c.fillStyle = gloss(c, -0.1, -0.1, 0.1, 0.1, "#f5ffd0", col);
    c.fill();
    outline(c, 0.02);
  } else if (type === "rail") {
    for (const y of [-0.15, 0.08]) {
      c.beginPath();
      c.rect(-0.12, y, 0.55, 0.07);
      c.fillStyle = metal;
      c.fill();
      outline(c, 0.025);
    }
    c.fillStyle = alpha(col, 0.8);
    c.fillRect(-0.05, -0.03, 0.45, 0.06);
    c.beginPath();
    c.rect(-0.27, -0.15, 0.2, 0.3);
    c.fillStyle = gloss(c, 0, -0.15, 0, 0.15, hi, lo);
    c.fill();
    outline(c);
    for (const x of [0.05, 0.18, 0.31]) {
      c.fillStyle = "#0d0d0d";
      c.fillRect(x, -0.15, 0.03, 0.3);
    }
  } else if (type === "artillery") {
    c.beginPath();
    c.rect(0.04, -0.07, 0.44, 0.14);
    c.fillStyle = metal;
    c.fill();
    outline(c, 0.03);
    c.beginPath();
    c.rect(0.4, -0.095, 0.08, 0.19);
    c.fillStyle = "#2a2622";
    c.fill();
    outline(c, 0.025);
    c.beginPath();
    c.arc(0, 0, 0.24, 0, TAU);
    c.fillStyle = gloss(c, -0.2, -0.2, 0.2, 0.2, hi, lo);
    c.fill();
    outline(c, 0.03);
    c.fillStyle = "rgba(0,0,0,.45)";
    for (let i = -2; i <= 2; i++) c.fillRect(-0.2, i * 0.07 - 0.01, 0.12, 0.02);
  }
}
export function towerVector(c: Ctx, type: TowerType, lvl: number, ang: number, spec: number) {
  towerBase(c, type, lvl, spec);
  c.save();
  c.rotate(ang);
  towerTurret(c, type, lvl);
  c.restore();
}
