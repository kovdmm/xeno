// Adapter between the game simulation (src/game, pure TypeScript) and the rest of the app, which still reads
// everything from the `XT.core` registry. It also puts the player-facing texts back onto the data tables
// (`name`, `desc`, ... of towers, enemies, difficulties, abilities), which the simulation itself does not have.
// Temporary: it goes away once UI, renderer and audio import from src/game and src/content directly.
import { createGame } from "./game/game";
import { pos } from "./game/combat";
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
  const B = game.balance;
  XT.core = {
    W: B.board.width,
    H: B.board.height,
    FINAL: B.board.finalWave,
    ROUTES: withText(B.board.routes, GAME_TEXT.routes),
    TT: withText(B.towers, GAME_TEXT.towers),
    TKEYS: Object.keys(B.towers),
    ET: withText(B.enemies, GAME_TEXT.enemies),
    DIFF: withText(B.difficulty, GAME_TEXT.difficulties),
    DKEYS: Object.keys(B.difficulty),
    AB: withText(B.abilities, GAME_TEXT.abilities),
    AKEYS: Object.keys(B.abilities),
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
    st: game.towerStats,
    upCost: game.upCost,
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
