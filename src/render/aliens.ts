// Painters of aliens: `f` is the animation frame 0..3. Unit-cell space, facing +x. No state.
import { THEME, TAU, type EnemyType } from "./theme";
import { alpha, shade } from "./color";
import { type Ctx, gloss, outline } from "./primitives";

function eyes(c: Ctx, pts: number[][], col = "#ffe23a", r = 0.045) {
  for (const [x, y] of pts) {
    c.beginPath();
    c.arc(x, y, r, 0, TAU);
    c.fillStyle = col;
    c.fill();
    c.beginPath();
    c.arc(x + r * 0.25, y, r * 0.4, 0, TAU);
    c.fillStyle = "#200";
    c.fill();
  }
}
export function alienVector(c: Ctx, type: EnemyType, r: number, f: number) {
  const col = THEME.enemy[type],
    hi = shade(col, 0.35),
    lo = shade(col, -0.65),
    w = Math.sin((f * TAU) / 4);
  c.lineCap = "round";
  if (type === "crawler") {
    c.strokeStyle = "#120306";
    c.lineWidth = 0.035;
    for (let k = -1; k <= 1; k++)
      for (const s of [-1, 1]) {
        const sw = w * 0.06 * (k % 2 ? 1 : -1) * s;
        c.beginPath();
        c.moveTo(k * 0.1, 0);
        c.quadraticCurveTo(k * 0.13 + sw, s * r * 0.9, k * 0.05 + sw * 1.5, s * r * 1.35);
        c.stroke();
      }
    c.beginPath();
    c.ellipse(0, 0, r, r * 0.72, 0, 0, TAU);
    c.fillStyle = gloss(c, 0, -r, 0, r, hi, lo);
    c.fill();
    outline(c);
    c.strokeStyle = "rgba(0,0,0,.5)";
    c.lineWidth = 0.02;
    for (const x of [-0.35, -0.05, 0.25]) {
      c.beginPath();
      c.moveTo(x * r, -r * 0.65);
      c.quadraticCurveTo(x * r + 0.04, 0, x * r, r * 0.65);
      c.stroke();
    }
    c.strokeStyle = "#120306";
    c.lineWidth = 0.03;
    c.beginPath();
    c.moveTo(r * 0.8, -r * 0.3);
    c.lineTo(r * 1.25, -r * 0.15 + w * 0.02);
    c.moveTo(r * 0.8, r * 0.3);
    c.lineTo(r * 1.25, r * 0.15 - w * 0.02);
    c.stroke();
    eyes(
      c,
      [
        [r * 0.6, -r * 0.25],
        [r * 0.6, r * 0.25],
      ],
      "#ffd21a",
      r * 0.14,
    );
  } else if (type === "runner") {
    c.beginPath();
    c.moveTo(-r * 1.5, w * r * 0.2);
    c.quadraticCurveTo(-r * 0.6, 0, -r * 0.3, 0);
    c.strokeStyle = lo;
    c.lineWidth = r * 0.35;
    c.stroke();
    c.beginPath();
    c.moveTo(r * 1.3, 0);
    c.lineTo(r * 0.1, r * 0.6);
    c.lineTo(-r * 0.6, r * 0.35);
    c.lineTo(-r * 0.5, -r * 0.35);
    c.lineTo(r * 0.1, -r * 0.6);
    c.closePath();
    c.fillStyle = gloss(c, 0, -r, 0, r, hi, lo);
    c.fill();
    outline(c);
    c.fillStyle = "#1a0800";
    for (let i = 0; i < 4; i++) {
      const x = r * (0.5 - i * 0.32);
      c.beginPath();
      c.moveTo(x, -r * 0.08);
      c.lineTo(x - r * 0.18, -r * 0.45);
      c.lineTo(x - r * 0.25, 0);
      c.fill();
    }
    eyes(c, [[r * 0.8, 0]], "#ff2a1a", r * 0.16);
  } else if (type === "swarm") {
    c.globalAlpha = 0.55;
    c.fillStyle = "#d8ffd0";
    for (const s of [-1, 1]) {
      c.beginPath();
      c.ellipse(-r * 0.2, s * r * (0.8 + w * 0.2), r * 0.8, r * 0.35, s * 0.4, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.fillStyle = gloss(c, -r, -r, r, r, "#e6ffb0", lo);
    c.fill();
    outline(c, 0.025);
    eyes(c, [[r * 0.45, 0]], "#fff04a", r * 0.3);
  } else if (type === "armored") {
    c.beginPath();
    for (let a = 0; a < 6; a++) {
      const q = (a * TAU) / 6;
      c[a ? "lineTo" : "moveTo"](Math.cos(q) * r * 1.05, Math.sin(q) * r * 1.05);
    }
    c.closePath();
    c.fillStyle = gloss(c, -r, -r, r, r, "#b8acc8", "#221a2c");
    c.fill();
    outline(c, 0.045);
    c.strokeStyle = "rgba(0,0,0,.6)";
    c.lineWidth = 0.03;
    c.beginPath();
    for (let a = 0; a < 6; a++) {
      const q = (a * TAU) / 6;
      c.moveTo(0, 0);
      c.lineTo(Math.cos(q) * r, Math.sin(q) * r);
    }
    c.stroke();
    c.beginPath();
    c.arc(0, 0, r * 0.38, 0, TAU);
    c.fillStyle = gloss(c, 0, -r * 0.4, 0, r * 0.4, "#9a8ab0", "#2c2238");
    c.fill();
    outline(c, 0.03);
    c.fillStyle = "#ff2a1a";
    c.fillRect(r * 0.55, -r * 0.08, r * 0.4, r * 0.16);
  } else if (type === "flyer") {
    const fl = 0.6 + 0.4 * w;
    c.fillStyle = alpha(col, 0.55);
    c.strokeStyle = "#14020c";
    c.lineWidth = 0.025;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(r * 0.2, 0);
      c.quadraticCurveTo(-r * 0.1, s * r * 1.9 * fl, -r * 0.9, s * r * 1.6 * fl);
      c.quadraticCurveTo(-r * 0.6, s * r * 0.9 * fl, -r * 0.9, s * r * 0.5);
      c.quadraticCurveTo(-r * 0.4, s * r * 0.4, -r * 0.3, 0);
      c.closePath();
      c.fill();
      c.stroke();
      c.beginPath();
      c.moveTo(r * 0.1, 0);
      c.lineTo(-r * 0.8, s * r * 1.5 * fl);
      c.moveTo(-r * 0.1, 0);
      c.lineTo(-r * 0.85, s * r * 0.9 * fl);
      c.strokeStyle = "rgba(20,2,12,.6)";
      c.stroke();
      c.strokeStyle = "#14020c";
    }
    c.beginPath();
    c.ellipse(0, 0, r * 0.85, r * 0.38, 0, 0, TAU);
    c.fillStyle = gloss(c, 0, -r * 0.4, 0, r * 0.4, hi, lo);
    c.fill();
    outline(c, 0.03);
    eyes(
      c,
      [
        [r * 0.55, -r * 0.12],
        [r * 0.55, r * 0.12],
      ],
      "#ff3a3a",
      r * 0.11,
    );
  } else if (type === "healer") {
    const p = 1 + 0.08 * w;
    c.beginPath();
    c.arc(0, 0, r * p, 0, TAU);
    c.fillStyle = gloss(c, -r, -r, r, r, "#c9ffb0", lo);
    c.globalAlpha = 0.9;
    c.fill();
    c.globalAlpha = 1;
    outline(c, 0.03);
    c.strokeStyle = "rgba(10,40,8,.7)";
    c.lineWidth = 0.03;
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i * TAU) / 5 + f * 0.2;
      c.moveTo(0, 0);
      c.quadraticCurveTo(
        Math.cos(a + 0.6) * r * 0.5,
        Math.sin(a + 0.6) * r * 0.5,
        Math.cos(a) * r * 0.9,
        Math.sin(a) * r * 0.9,
      );
    }
    c.stroke();
    c.fillStyle = "#f6ffe8";
    c.fillRect(-r * 0.12, -r * 0.45, r * 0.24, r * 0.9);
    c.fillRect(-r * 0.45, -r * 0.12, r * 0.9, r * 0.24);
  } else if (type === "blinker") {
    c.beginPath();
    c.moveTo(r * 1.25, 0);
    c.lineTo(r * 0.1, r * 0.7);
    c.lineTo(-r * 0.25, r * 0.2);
    c.lineTo(-r * 0.9, r * 0.5);
    c.lineTo(-r * 0.6, 0);
    c.lineTo(-r * 0.9, -r * 0.5);
    c.lineTo(-r * 0.25, -r * 0.2);
    c.lineTo(r * 0.1, -r * 0.7);
    c.closePath();
    c.fillStyle = gloss(c, 0, -r, 0, r, "#fff8c0", lo);
    c.fill();
    outline(c, 0.03);
    c.strokeStyle = alpha("#ffffff", 0.5 + 0.5 * w);
    c.lineWidth = 0.02;
    c.beginPath();
    c.moveTo(-r * 0.6, 0);
    c.lineTo(-r * 0.1, -r * 0.25);
    c.lineTo(r * 0.2, r * 0.15);
    c.lineTo(r * 0.8, 0);
    c.stroke();
    eyes(c, [[r * 0.55, 0]], "#2a1a00", r * 0.12);
  } else if (type === "boss" || type === "queen") {
    const Q = type === "queen",
      n = Q ? 9 : 7;
    c.strokeStyle = lo;
    c.lineWidth = r * 0.16;
    for (let i = 0; i < n; i++) {
      const a = (i * TAU) / n + f * 0.12,
        b = a + 0.35 * Math.sin((f * TAU) / 4 + i);
      c.beginPath();
      c.moveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
      c.quadraticCurveTo(
        Math.cos(a) * r * 1.15,
        Math.sin(a) * r * 1.15,
        Math.cos(b) * r * 1.45,
        Math.sin(b) * r * 1.45,
      );
      c.stroke();
    }
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * TAU) / 16,
        rr = r * (i % 2 ? 1 : 0.86);
      c[i ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = gloss(c, -r, -r, r, r, hi, shade(col, -0.8));
    c.fill();
    outline(c, 0.05);
    c.beginPath();
    c.arc(-r * 0.15, 0, r * 0.55, 0, TAU);
    c.fillStyle = "rgba(0,0,0,.35)";
    c.fill();
    const ey = Q
      ? [
          [r * 0.45, -r * 0.32],
          [r * 0.6, 0],
          [r * 0.45, r * 0.32],
          [r * 0.15, -r * 0.18],
          [r * 0.15, r * 0.18],
          [-r * 0.1, 0],
        ]
      : [
          [r * 0.45, -r * 0.25],
          [r * 0.55, r * 0.05],
          [r * 0.3, r * 0.3],
          [r * 0.15, -r * 0.05],
        ];
    eyes(c, ey, "#ffdf3a", r * 0.1);
    if (Q) {
      c.fillStyle = THEME.accent;
      c.strokeStyle = "#000";
      c.lineWidth = 0.03;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI + (i - 2) * 0.35;
        c.beginPath();
        c.moveTo(Math.cos(a - 0.12) * r * 0.8, Math.sin(a - 0.12) * r * 0.8);
        c.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3);
        c.lineTo(Math.cos(a + 0.12) * r * 0.8, Math.sin(a + 0.12) * r * 0.8);
        c.closePath();
        c.fill();
        c.stroke();
      }
    }
  }
}
