// The game as the rest of the app uses it: the simulation (src/game) with the player-facing texts put back onto
// its data tables (`name`, `desc`, ... of towers, enemies, difficulties, abilities), which the simulation itself
// does not have. The texts come from the translator and are live: they read the current language every time.
import { pos } from "./game/combat";
import { createGame, type GameApi } from "./game/game";
import type { Rng } from "./game/types";
import type { Core, I18n } from "./ui/types";

/** The translator parts the texts are read from. */
export type TextSource = {
  gameText(path: string): string;
  gameFields(path: string): string[];
};

type Table = Record<string, Record<string, unknown> & { ults?: Record<string, Record<string, unknown>> }>;

/** Copies of a data table whose texts are live properties; the ultimates of towers get theirs too. */
function withText(table: Table, section: string, i18n: TextSource) {
  const addTexts = (o: Record<string, unknown>, path: string) => {
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

/** What the rest of the app gets: the interface view of the game plus what the renderer reads. */
export type GameCore = Core & Pick<GameApi, "routePath" | "unitHP"> & { pos: typeof pos };

/** Builds the game. `rng` is the simulation's own random stream (tests pass a seeded one). */
export function createCore(i18n: TextSource, rng?: Rng): GameCore {
  const game = createGame({ rng });
  const B = game.balance;
  return {
    W: B.board.width,
    H: B.board.height,
    FINAL: B.board.finalWave,
    ROUTES: withText(B.board.routes as never, "routes", i18n),
    TT: withText(B.towers as never, "towers", i18n),
    TKEYS: Object.keys(B.towers),
    ET: withText(B.enemies as never, "enemies", i18n),
    DIFF: withText(B.difficulty as never, "difficulties", i18n),
    DKEYS: Object.keys(B.difficulty),
    AB: withText(B.abilities as never, "abilities", i18n),
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
  } as never;
}

export type { I18n };
