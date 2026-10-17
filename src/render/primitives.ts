// Small drawing helpers shared by the sprite painters.
import { TAU } from "./theme";

export type Ctx = CanvasRenderingContext2D;

export function outline(c: Ctx, w: number = 0.035) {
  c.lineWidth = w;
  c.strokeStyle = "#000";
  c.lineJoin = "round";
  c.stroke();
}
export function gloss(c: Ctx, x0: number, y0: number, x1: number, y1: number, hi: string, lo: string) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, hi);
  g.addColorStop(1, lo);
  return g;
}
export function rivet(c: Ctx, x: number, y: number, r = 0.028) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = "#0b0a09";
  c.fill();
  c.beginPath();
  c.arc(x - r * 0.3, y - r * 0.3, r * 0.55, 0, TAU);
  c.fillStyle = "#8a8378";
  c.fill();
}

export function oct(c: Ctx, r: number) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * TAU) / 8 + TAU / 16;
    c[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
}
