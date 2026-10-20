// A scripted game that exercises the simulation (every tower type, abilities, early waves) and a fingerprint of how
// it ends. The same script runs in node (tests/seed.test.ts) and in the browsers (e2e/determinism.spec.ts): the
// fingerprint must be the same everywhere, or replaying a player's run on the server could not be trusted.
import { TICK } from "./constants";
import { createGame, type GameApi } from "./game";
import { createRecorder } from "./recorder";
import { replay, type Outcome, type Run } from "./run";
import type { Tower, TowerType } from "./types";

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

/**
 * A whole game through the recorder, played by an honest script (no cheats): guns along the enemy route, upgrades,
 * a stasis, a sale, waves called early, and in the end all of them at once until the base falls.
 */
export function recordedGame(seed = 21): { run: Run; ended: Outcome } {
  const game = createGame();
  const rec = createRecorder(game);
  rec.newGame("easy", "crossroads", seed);
  const placed: Tower[] = [];
  const route = game.routePath(Object.keys(game.level.routes)[0]);
  for (let i = 4; i < route.length && placed.length < 4; i += 4)
    for (const dy of [1, -1]) {
      const r = rec.place(placed.length % 2 ? "cannon" : "gun", route[i][0], route[i][1] + dy);
      if (r.ok) {
        placed.push(r.tower);
        break;
      }
    }
  rec.sendWave(true);
  let sold = false,
    cast = false;
  for (let tick = 0; tick < 60000 && !game.S.over; tick++) {
    if (tick % 10 === 0) {
      const S = game.S;
      // the first ability the credits allow (a meteor shower if possible: it throws random numbers and uses sin/cos)
      const c = S.creeps[0];
      if (!cast && c) {
        const pt: [number, number] = [c.x + 0.5, c.y + 0.5];
        cast = rec.cast("meteor", pt).ok || rec.cast("napalm", pt).ok;
      }
      if (tick > 2500)
        for (const t of placed) if (S.towers.includes(t) && S.credits >= game.upCost(t) && t.lvl < 3) rec.upgrade(t);
      if (!sold && tick > 1500 && placed.length > 3) sold = (rec.sell(placed[3]), true);
      if (tick > 4000 && tick % 120 === 0) rec.sendWave(true);
    }
    rec.step(TICK);
  }
  const run = rec.run();
  if (!run) throw new Error("the scripted game did not end");
  const S = game.S;
  return { run, ended: { won: S.won, wave: S.wave, score: S.score, lives: S.lives, seconds: S.t } };
}

/** what the recorded game came to and a hash of its commands, as text: the same in every engine */
export function runDigest(): string {
  const { run, ended } = recordedGame();
  let h = 0x811c9dc5;
  const text = JSON.stringify(run.actions); // not the build: the digest must not change with every edit of the game
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return JSON.stringify({ ended, commands: run.actions.length, ticks: run.ticks, hash: h });
}

export { replay };
