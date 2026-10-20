// Math the simulation can rely on to give the same bits in every JavaScript engine.
//
// `Math.sin`, `cos`, `atan2`, `hypot` and `pow` are not required to be correctly rounded, and V8, JavaScriptCore and
// SpiderMonkey do differ in the last bit. A run that is replayed on the server to check a score would drift away from
// the one the player's browser played (the game is chaotic: a tie in targeting is enough). The functions here use only
// `+ - * /`, `Math.sqrt`, `Math.round`/`floor` and exact bit access, which every engine does the same way (IEEE 754).
// They are accurate to a few ulp (tests/dmath.test.ts), which is all the game needs.

const PI = Math.PI;
const HALF_PI = PI / 2;

/** sqrt(x² + y²). `Math.hypot` is the one that differs between engines. */
export const hypot = (x: number, y: number): number => Math.sqrt(x * x + y * y);

// --- sin / cos ---------------------------------------------------------------------------------------------------

// pi/2 in three parts (fdlibm): k * part stays exact for the k the game produces
const PIO2_1 = 1.5707963267341256;
const PIO2_2 = 6.077100506303966e-11;
const PIO2_3 = 2.0222662487111665e-21;
const TWO_OVER_PI = 2 / PI;

/** x = k * pi/2 + r with |r| <= pi/4; returns r and sets the quadrant */
let quadrant = 0;
function reduce(x: number): number {
  const k = Math.round(x * TWO_OVER_PI);
  quadrant = (((k % 4) + 4) % 4) | 0;
  return x - k * PIO2_1 - k * PIO2_2 - k * PIO2_3;
}

/** Taylor series on [-pi/4, pi/4] */
function sinKernel(x: number): number {
  const z = x * x;
  return (
    x *
    (1 +
      z *
        (-1 / 6 +
          z *
            (1 / 120 +
              z *
                (-1 / 5040 +
                  z * (1 / 362880 + z * (-1 / 39916800 + z * (1 / 6227020800 + z * (-1 / 1307674368000))))))))
  );
}
function cosKernel(x: number): number {
  const z = x * x;
  return (
    1 +
    z *
      (-1 / 2 +
        z *
          (1 / 24 +
            z *
              (-1 / 720 +
                z *
                  (1 / 40320 +
                    z * (-1 / 3628800 + z * (1 / 479001600 + z * (-1 / 87178291200 + z * (1 / 20922789888000))))))))
  );
}

export function sin(x: number): number {
  const r = reduce(x);
  switch (quadrant) {
    case 0:
      return sinKernel(r);
    case 1:
      return cosKernel(r);
    case 2:
      return -sinKernel(r);
    default:
      return -cosKernel(r);
  }
}

export function cos(x: number): number {
  const r = reduce(x);
  switch (quadrant) {
    case 0:
      return cosKernel(r);
    case 1:
      return -sinKernel(r);
    case 2:
      return -cosKernel(r);
    default:
      return sinKernel(r);
  }
}

// --- atan2 -------------------------------------------------------------------------------------------------------

/** atan for |x| <= 1: two halvings of the angle, then the series */
function atanUnit(x: number): number {
  let t = x / (1 + Math.sqrt(1 + x * x));
  t = t / (1 + Math.sqrt(1 + t * t));
  const z = t * t;
  const s =
    t *
    (1 +
      z *
        (-1 / 3 +
          z *
            (1 / 5 +
              z *
                (-1 / 7 +
                  z *
                    (1 / 9 +
                      z *
                        (-1 / 11 +
                          z *
                            (1 / 13 +
                              z * (-1 / 15 + z * (1 / 17 + z * (-1 / 19 + z * (1 / 21 + z * (-1 / 23))))))))))));
  return 4 * s;
}

const isNegZero = (v: number) => v === 0 && 1 / v < 0;

/** Same results as `Math.atan2`, including the signs of zero. */
export function atan2(y: number, x: number): number {
  const ax = Math.abs(x),
    ay = Math.abs(y);
  let a: number;
  if (ax === 0 && ay === 0) a = 0;
  else a = ay <= ax ? atanUnit(ay / ax) : HALF_PI - atanUnit(ax / ay);
  if (x < 0 || isNegZero(x)) a = PI - a;
  return y < 0 || isNegZero(y) ? -a : a;
}

// --- exp / log / pow ---------------------------------------------------------------------------------------------

const LN2_HI = 6.931471803691238e-1;
const LN2_LO = 1.9082149292705877e-10;
const INV_LN2 = 1 / 0.6931471805599453;

const bits = new DataView(new ArrayBuffer(8));
/** 2^k for an integer k in [-1022, 1023], built from its bits */
function pow2(k: number): number {
  bits.setUint32(0, (k + 1023) << 20);
  bits.setUint32(4, 0);
  return bits.getFloat64(0);
}

export function exp(x: number): number {
  const k = Math.round(x * INV_LN2);
  const r = x - k * LN2_HI - k * LN2_LO;
  // Taylor series on [-ln2/2, ln2/2]
  let s = 1;
  for (let n = 15; n >= 1; n--) s = 1 + (r * s) / n;
  const h = (k / 2) | 0; // two steps keep 2^k in range
  return s * pow2(h) * pow2(k - h);
}

/** Natural log of a positive finite number. */
export function log(x: number): number {
  let e = 0;
  while (x < 2.2250738585072014e-308) {
    x *= 2 ** 54; // a subnormal or tiny number: bring it into the normal range
    e -= 54;
  }
  bits.setFloat64(0, x);
  const hi = bits.getUint32(0);
  e += ((hi >>> 20) & 0x7ff) - 1023;
  bits.setUint32(0, (hi & 0x000fffff) | 0x3ff00000); // the mantissa as a number in [1, 2)
  let m = bits.getFloat64(0);
  if (m > 1.4142135623730951) {
    m /= 2;
    e += 1;
  }
  const s = (m - 1) / (m + 1),
    z = s * s;
  let p = 0;
  for (let n = 27; n >= 3; n -= 2) p = 1 / n + z * p;
  const lnm = 2 * s * (1 + z * p);
  return e * LN2_HI + (e * LN2_LO + lnm);
}

/** x^y for x > 0. Integer exponents use only multiplications. */
export function pow(x: number, y: number): number {
  if (y === 0) return 1;
  if (Number.isInteger(y) && Math.abs(y) <= 4096) {
    let r = 1,
      b = x,
      n = Math.abs(y);
    while (n > 0) {
      if (n & 1) r *= b;
      b *= b;
      n >>= 1;
    }
    return y < 0 ? 1 / r : r;
  }
  return exp(y * log(x));
}
