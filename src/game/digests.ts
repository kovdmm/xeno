// What V8 in node computes for the determinism checks. Kept apart, with no imports, so the browser tests can read
// the numbers without loading the game: e2e/determinism.spec.ts runs the checks in every browser installed.

/** `mathDigest()` of dmathCheck.ts */
export const MATH_DIGEST = 1548050069;

/** `gameDigest()` of selfCheck.ts */
export const GAME_DIGEST =
  '{"towers":10,"wave":20,"score":11023,"lives":20,"creeps":25,"sum":1652.3826359240493,"t":99.99999999999561}';
