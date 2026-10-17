// The game as the rest of the app uses it: the simulation (src/game) with the player-facing texts put back onto
// its data tables (`name`, `desc`, ... of towers, enemies, difficulties, abilities), which the simulation itself
// does not have. The texts come from the translator and are live: they read the current language every time.
import { pos } from "./game/combat";
import { createGame, type GameApi } from "./game/game";
import type { LevelDef, Rng } from "./game/types";
import type { Core, I18n } from "./ui/types";

/** The translator parts the texts are read from. */
export type TextSource = {
  gameText(path: string): string;
  gameFields(path: string): string[];
};

type Table = Record<string, Record<string, unknown> & { ults?: Record<string, Record<string, unknown>> }>;

/** Gives `o` the texts of the entry at `path` (name, desc, ...) as live properties. */
function addTexts<T extends Record<string, unknown>>(o: T, path: string, i18n: TextSource): T {
  for (const f of i18n.gameFields(path))
    Object.defineProperty(o, f, { enumerable: true, get: () => i18n.gameText(path + "." + f) });
  return o;
}

/** Copies of a data table whose texts are live properties; the ultimates of towers get theirs too. */
function withText(table: Table, section: string, i18n: TextSource) {
  return Object.fromEntries(
    Object.entries(table).map(([id, v]) => {
      const o = addTexts({ ...v }, section + "." + id, i18n);
      if (v.ults)
        o.ults = Object.fromEntries(
          Object.entries(v.ults).map(([u, d]) => [u, addTexts({ ...d }, section + "." + id + ".ults." + u, i18n)]),
        );
      return [id, o];
    }),
  );
}

/** A level for the interface: its size and length, and its name and description in the current language. */
function levelInfo(id: string, d: LevelDef, i18n: TextSource) {
  return addTexts(
    { id, finalWave: d.finalWave, width: d.map.width, height: d.map.height, map: d.map },
    "levels." + id,
    i18n,
  );
}

/** What the rest of the app gets: the interface view of the game plus what the renderer reads. */
export type GameCore = Core & Pick<GameApi, "routePath" | "unitHP"> & { pos: typeof pos };

/** Builds the game. `rng` is the simulation's own random stream (tests pass a seeded one). */
export function createCore(i18n: TextSource, rng?: Rng): GameCore {
  const game = createGame({ rng });
  const B = game.balance;
  return {
    // the board follows the level being played
    get W() {
      return game.level.width;
    },
    get H() {
      return game.level.height;
    },
    get FINAL() {
      return game.level.finalWave;
    },
    get ROUTES() {
      return game.level.routes as never;
    },
    get WALLS() {
      return game.level.walls;
    },
    get LEVEL() {
      return game.level.id;
    },
    LEVELS: Object.fromEntries(game.levelIds.map((id) => [id, levelInfo(id, game.balance.levels[id], i18n)])) as never,
    LKEYS: game.levelIds,
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
