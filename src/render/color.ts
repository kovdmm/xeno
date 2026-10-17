// Colour arithmetic on "#rrggbb" strings. Pure functions.
export type RGB = [number, number, number];

export function rgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

export function alpha(hex: string, a: number): string {
  const [r, g, b] = rgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/** Lighter for k > 0 (towards white), darker for k < 0 (towards black). */
export function shade(hex: string, k: number): string {
  let [r, g, b] = rgb(hex);
  if (k >= 0) {
    r += (255 - r) * k;
    g += (255 - g) * k;
    b += (255 - b) * k;
  } else {
    r *= 1 + k;
    g *= 1 + k;
    b *= 1 + k;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function mix(a: string, b: string, t: number): string {
  const A = rgb(a),
    B = rgb(b);
  return (
    "#" +
    A.map((v, i) =>
      Math.round(v + (B[i] - v) * t)
        .toString(16)
        .padStart(2, "0"),
    ).join("")
  );
}

/** h in degrees, s and l in 0..1 → r, g, b in 0..1. */
export function hsl(h: number, s: number, l: number): RGB {
  const a = s * Math.min(l, 1 - l),
    f = (n: number) => l - a * Math.max(-1, Math.min(((n + h / 30) % 12) - 3, 9 - ((n + h / 30) % 12), 1));
  return [f(0), f(8), f(4)];
}

/** Relative luminance of an r, g, b triple in 0..1 (WCAG). */
export const lum = ([r, g, b]: RGB): number => {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};

/** The same brightness at any hue: bisects the lightness until the relative luminance is `target`. */
export function fitted(h: number, target: number): string {
  let lo = 0.2,
    hi = 0.8;
  for (let i = 0; i < 24; i++) {
    const m = (lo + hi) / 2;
    if (lum(hsl(h, 1, m)) < target) lo = m;
    else hi = m;
  }
  return (
    "#" +
    hsl(h, 1, lo)
      .map((v) =>
        Math.round(v * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}
