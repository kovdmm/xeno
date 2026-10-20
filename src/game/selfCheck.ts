// A scripted game that exercises the simulation (every tower type, abilities, early waves) and a fingerprint of how
// it ends. The same script runs in node (tests/seed.test.ts) and in the browsers (e2e/determinism.spec.ts): the
// fingerprint must be the same everywhere, or replaying a player's run on the server could not be trusted.
import { TICK } from "./constants";
import { createGame, type GameApi } from "./game";
import type { TowerType } from "./types";

const TYPES: TowerType[] = ["gun", "cannon", "frost", "missile", "laser", "plasma", "rail", "artillery", "gun", "rail"];

/** plays the script from a seed and returns what the game looks like at the end */
export function scriptedGame(game: GameApi, seed: number, level = "switchback", ticks = 6000) {
  game.newGame("normal", level, seed);
  game.cheat("lxgiwyl"); // free towers: the script must not depend on credits
  const { width: W, height: H } = game.level;
  let placed = 0;
  for (const type of TYPES) {
    const size = game.balance.towers[type].size || 1;
    search: for (let y = 1; y < H - 1; y += 2)
      for (let x = (placed * 5) % 7; x < W - 1; x += 3)
        if (game.placeCheck(x, y, size) === "" && game.place(type, x, y).ok) {
          placed++;
          break search;
        }
  }
  for (let n = 0; n < ticks; n++) {
    if (n % 300 === 0) game.sendWave(true);
    if (n % 900 === 450) game.cast("meteor", [W / 2, H / 2]);
    if (n % 1500 === 700) game.cast("napalm", [W / 3, H / 2]);
    if (n === 2000) for (const t of [...game.S.towers]) game.upgrade(t);
    game.step(TICK);
  }
  const S = game.S;
  let sum = 0;
  for (const c of S.creeps) sum += c.x * 7 + c.y * 13;
  for (const p of S.proj) sum += p.x * 3 + p.y * 5;
  return {
    towers: S.towers.length,
    wave: S.wave,
    score: S.score,
    lives: S.lives,
    creeps: S.creeps.length,
    sum,
    t: S.t,
  };
}

/** the end state of the script as text: floats print as the shortest text that reads back to the same bits */
export function gameDigest(): string {
  return JSON.stringify(scriptedGame(createGame(), 5));
}
