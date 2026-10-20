// A fingerprint of dmath over a fixed set of inputs. The same number must come out in node and in every browser:
// tests/dmath.test.ts checks it in node, e2e/determinism.spec.ts loads this module in the browsers.
import { atan2, cos, hypot, pow, sin } from "./dmath";
import { mulberry32 } from "./rng";

/** FNV-1a over the bits of the results */
export function mathDigest(): number {
  const r = mulberry32(777);
  const buf = new Float64Array(1);
  const u = new Uint32Array(buf.buffer);
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    buf[0] = v;
    for (const w of u) h = Math.imul(h ^ w, 0x01000193) >>> 0;
  };
  for (let i = 0; i < 2000; i++) {
    const a = (r() - 0.5) * 50,
      b = (r() - 0.5) * 50;
    mix(sin(a));
    mix(cos(a));
    mix(atan2(a, b));
    mix(hypot(a, b));
    mix(pow(1 + r() * 0.4, r() * 50));
    mix(pow(1 + r() * 0.4, Math.floor(r() * 200)));
  }
  return h;
}
