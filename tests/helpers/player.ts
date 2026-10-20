// A scripted player for the replay tests and the replay-cost benchmark: it builds along the enemy routes,
// upgrades, picks ultimates, calls waves early, casts a meteor now and then and sells one tower, always through
// the recorder, in whole ticks. Everything it does is a function of the game state, so a seed gives one game.
import { TICK } from "../../src/game/constants";
import type { GameApi } from "../../src/game/game";
import type { Recorder } from "../../src/game/recorder";
import type { Tower, TowerType } from "../../src/game/types";

export interface PlayOptions {
  seed: number;
  level: string;
  diff: string;
  /** stop after this many ticks even if the game is not over */
  maxTicks: number;
  /** call the next wave early when at most this many enemies are on the board */
  callAt?: number;
  /** from this tick on the player only calls waves, so that the game ends */
  collapseAt?: number;
  towers?: TowerType[];
}

/** Plays one game through the recorder; returns the number of ticks played. */
export function autoPlay(game: GameApi, rec: Recorder, o: PlayOptions): number {
  rec.newGame(o.diff, o.level, o.seed);
  const kinds = o.towers ?? ["gun", "gun", "cannon", "frost", "gun", "missile", "rail", "plasma"];
  const { width: W, height: H } = game.level;
  // build sites: cells two away from the enemy routes, in the order of the routes
  const sites: [number, number][] = [];
  const seen = new Set<number>();
  for (const r of Object.keys(game.level.routes))
    for (const [px, py] of game.routePath(r))
      for (const [dx, dy] of [
        [0, 2],
        [0, -2],
        [2, 0],
        [-2, 0],
      ]) {
        const x = px + dx,
          y = py + dy;
        if (x < 0 || y < 0 || x >= W - 1 || y >= H - 1 || seen.has(y * W + x)) continue;
        seen.add(y * W + x);
        sites.push([x, y]);
      }
  let built = 0,
    sold = false,
    meteors = 0;
  let tick = 0;
  for (; tick < o.maxTicks && !game.S.over; tick++) {
    if (tick % 20 === 0) {
      const S = game.S;
      // after the collapse the player stops building and calls every wave at once, until the base falls
      const collapsing = o.collapseAt !== undefined && tick >= o.collapseAt;
      if ((collapsing || S.creeps.length <= (o.callAt ?? 4)) && S.wave < game.level.finalWave) rec.sendWave(true);
      const type = kinds[built % kinds.length];
      if (collapsing) {
        /* nothing to build */
      } else if (built < 9 + S.wave / 3 && S.credits >= game.balance.towers[type].cost[0]) {
        for (let i = 0; i < sites.length; i++) {
          const [x, y] = sites[(built * 7 + i) % sites.length];
          if (game.placeCheck(x, y, game.balance.towers[type].size || 1) === "" && rec.place(type, x, y).ok) {
            built++;
            break;
          }
        }
      } else if (S.towers.length) {
        const t = S.towers.reduce((a: Tower, b: Tower) => (b.lvl + b.oc < a.lvl + a.oc ? b : a));
        const ults = Object.keys(game.balance.towers[t.type].ults);
        rec.upgrade(t, t.lvl === 3 ? ults[tick % ults.length] : undefined);
      }
      if (!sold && tick > 3000 && S.towers.length > 5) {
        rec.sell(S.towers[S.towers.length - 1]);
        sold = true;
      }
      if (tick % 400 === 0 && S.creeps.length && meteors < 20) {
        const c = S.creeps[0];
        // whichever the credits allow: they are only recorded when they work
        if (rec.cast("meteor", [c.x + 0.5, c.y + 0.5]).ok) meteors++;
        else if (rec.cast("napalm", [c.x + 0.5, c.y + 0.5]).ok) meteors++;
        else rec.cast("stasis");
      }
    }
    rec.step(TICK);
  }
  return tick;
}
