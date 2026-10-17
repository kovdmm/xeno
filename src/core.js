// Adapter between the game simulation (src/game, pure TypeScript) and the rest of the app, which still reads
// everything from the `XT.core` registry. It also puts the player-facing texts back onto the data tables
// (`name`, `desc`, ... of towers, enemies, difficulties, abilities), which the simulation itself does not have.
// Temporary: it goes away once UI, renderer and audio import from src/game and src/content directly.
import { createGame } from "./game/game";
import { pos } from "./game/combat";
import { FINAL, H, W } from "./game/constants";
import { AB, AKEYS } from "./game/data/abilities";
import { DIFF, DKEYS } from "./game/data/difficulty";
import { ET } from "./game/data/enemies";
import { ROUTES } from "./game/data/routes";
import { TKEYS, TT } from "./game/data/towers";
import { towerStats, upCost } from "./game/rules";
import { GAME_TEXT } from "./content/gameText";

/** Copies of a data table with the matching texts merged in (also for each tower's ultimates). */
function withText(table, text) {
  return Object.fromEntries(
    Object.entries(table).map(([k, v]) => {
      const t = text[k] || {};
      const o = { ...v, ...t };
      if (v.ults)
        o.ults = Object.fromEntries(Object.entries(v.ults).map(([u, d]) => [u, { ...d, ...(t.ults && t.ults[u]) }]));
      return [k, o];
    }),
  );
}

export function installCore(XT) {
  const game = createGame({ rng: XT.rng && XT.rng.core });
  XT.core = {
    W,
    H,
    FINAL,
    ROUTES: withText(ROUTES, GAME_TEXT.routes),
    TT: withText(TT, GAME_TEXT.towers),
    TKEYS,
    ET: withText(ET, GAME_TEXT.enemies),
    DIFF: withText(DIFF, GAME_TEXT.difficulties),
    DKEYS,
    AB: withText(AB, GAME_TEXT.abilities),
    AKEYS,
    get S() {
      return game.S;
    },
    on: game.on,
    newGame: game.newGame,
    step: game.step,
    // commands
    place: game.place,
    upgrade: game.upgrade,
    sell: game.sell,
    sendWave: game.sendWave,
    cast: game.cast,
    cheat: game.cheat,
    // queries (read-only)
    stats: game.stats,
    st: towerStats,
    upCost,
    abCost: game.abCost,
    makeWave: game.makeWave,
    placeCheck: game.placeCheck,
    buildOrigin: game.buildOrigin,
    towerAt: game.towerAt,
    routePath: game.routePath,
    unitHP: game.unitHP,
    pos,
    difficulty: game.difficulty,
  };
}
