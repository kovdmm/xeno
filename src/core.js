// Adapter between the game simulation (src/game, pure TypeScript) and the rest of the app, which still reads
// everything from the `XT.core` registry. It also puts the player-facing texts back onto the data tables
// (`name`, `desc`, ... of towers, enemies, difficulties, abilities), which the simulation itself does not have.
// The texts come from XT.i18n (src/i18n), so XT.i18n must be installed first.
// Temporary: it goes away once UI, renderer and audio import from src/game and src/content directly.
import { createGame } from "./game/game";
import { pos } from "./game/combat";

/** Copies of a data table whose texts (`name`, `desc`, ...) are live properties: they read the current language
 *  every time, so switching language needs no rebuild. Ultimates of towers get theirs too. */
function withText(table, section, i18n) {
  const addTexts = (o, path) => {
    for (const f of i18n.gameFields(path))
      Object.defineProperty(o, f, { enumerable: true, get: () => i18n.gameText(path + "." + f) });
    return o;
  };
  return Object.fromEntries(
    Object.entries(table).map(([id, v]) => {
      const o = addTexts({ ...v }, section + "." + id);
      if (v.ults)
        o.ults = Object.fromEntries(
          Object.entries(v.ults).map(([u, d]) => [u, addTexts({ ...d }, section + "." + id + ".ults." + u)]),
        );
      return [id, o];
    }),
  );
}

export function installCore(XT) {
  const game = createGame({ rng: XT.rng && XT.rng.core });
  const B = game.balance,
    I = XT.i18n;
  XT.core = {
    W: B.board.width,
    H: B.board.height,
    FINAL: B.board.finalWave,
    ROUTES: withText(B.board.routes, "routes", I),
    TT: withText(B.towers, "towers", I),
    TKEYS: Object.keys(B.towers),
    ET: withText(B.enemies, "enemies", I),
    DIFF: withText(B.difficulty, "difficulties", I),
    DKEYS: Object.keys(B.difficulty),
    AB: withText(B.abilities, "abilities", I),
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
