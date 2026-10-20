// What the interface knows about the rest of the app. The game, the translator, the sound and the renderer
// are handed in (see createUi), so the interface can be built and tested with stand-ins for all of them.
import type { Lock } from "../game/campaign";
import type { GameApi } from "../game/game";
import type { Run } from "../game/run";
import type { ScoresClient } from "../scores";
import type {
  AbilityDef,
  AbilityKey,
  DiffKey,
  Difficulty,
  EnemyDef,
  EnemyType,
  MapDef,
  Route,
  RouteKey,
  State,
  Tower,
  TowerDef,
  TowerType,
  UltEffect,
  Vec,
} from "../game/types";
import type { AudioSystem } from "../audio/system";
import type { Renderer } from "../render/renderer";
import type { KeyValueStore } from "../storage";

/** The texts a data entry carries; they read the current language when asked. `…Rotated` is for a turned board. */
export interface Texted {
  name: string;
  desc: string;
  short?: string;
  label?: string;
  labelRotated?: string;
  descRotated?: string;
}
type WithText<T> = T & Texted;

export type TowerInfo = Omit<TowerDef, "ults"> & Texted & { ults: Record<string, WithText<UltEffect>> };

/** The game as the interface sees it: commands, queries, and the data tables with their texts. */
export interface Core extends Pick<
  GameApi,
  | "on"
  | "newGame"
  | "step"
  | "place"
  | "upgrade"
  | "sell"
  | "sendWave"
  | "cast"
  | "cheat"
  | "stats"
  | "upCost"
  | "abCost"
  | "makeWave"
  | "placeCheck"
  | "buildOrigin"
  | "towerAt"
  | "difficulty"
> {
  /** starts a game; a level id changes the board */
  newGame(difficulty?: string, level?: string, seed?: number): State;
  /** the finished game as a recording the server can replay; null while it goes on, or if it cannot be replayed */
  run(): Run | null;
  readonly S: State;
  readonly W: number;
  readonly H: number;
  readonly FINAL: number;
  /** the routes of the level being played */
  readonly ROUTES: Record<RouteKey, Route>;
  readonly WALLS: Vec[];
  /** the id of the level being played, the levels with their texts, and their ids in order */
  readonly LEVEL: string;
  readonly LEVELS: Record<string, LevelInfo>;
  readonly LKEYS: string[];
  /** the campaign's rule: what keeps a map × difficulty closed given the best waves (null: open) */
  lockOf(level: string, diff: string, best: (level: string, diff: string) => number): Lock | null;
  readonly TT: Record<TowerType, TowerInfo>;
  readonly TKEYS: TowerType[];
  readonly ET: Record<EnemyType, WithText<EnemyDef>>;
  readonly DIFF: Record<DiffKey, WithText<Difficulty>>;
  readonly DKEYS: DiffKey[];
  readonly AB: Record<AbilityKey, WithText<AbilityDef>>;
  readonly AKEYS: AbilityKey[];
  /** stats of a hypothetical tower: type, level, ultimate, overclock */
  st: GameApi["towerStats"];
}

/** A level as the interface shows it. */
export interface LevelInfo extends Texted {
  id: string;
  map: MapDef;
  finalWave: number;
  width: number;
  height: number;
}

export interface Language {
  code: string;
  html: string;
  name: string;
}

export interface I18n {
  readonly LANGUAGES: readonly Language[];
  readonly lang: string;
  readonly htmlLang: string;
  setLang(code: string): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  t(key: string, vars?: Record<string, string | number>): any;
  /** the name/desc/short/label of a data entry */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  L(o: any, f?: string): string;
}

export type Sound = Pick<
  AudioSystem,
  "ok" | "muted" | "volume" | "musicVolume" | "play" | "update" | "setMuted" | "setVolume" | "setMusicVolume"
>;

export interface UiDeps {
  core: Core;
  i18n: I18n;
  /** absent when there is no sound backend: the game runs silently */
  sound?: Sound;
  createRenderer(canvas: HTMLCanvasElement): Renderer;
  store: KeyValueStore;
  /** the highscore service; the real one (relative to the page) when absent */
  scores?: ScoresClient;
}

export type { Tower, Vec };
