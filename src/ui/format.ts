/** Compact numbers for the HUD: 12 345 becomes "12k", 3 400 000 becomes "3.4M". */
export function fmt(v: number): string | number {
  if (v >= 1e12) return (v / 1e12).toFixed(1) + "T";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e4) return Math.round(v / 1e3) + "k";
  return v >= 100 ? Math.round(v) : Math.round(v * 10) / 10;
}
