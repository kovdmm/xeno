// What every part of the interface is handed: the game, the texts, the sound, the renderer, the player's hand
// (UiState) and a few shared helpers. It is built once in createUi; the parts add behaviour, not state.
import type { Renderer } from "../render/renderer";
import type { KeyValueStore } from "../storage";
import type { CardEnv } from "./cards";
import type { Screens } from "./screens";
import type { UiState } from "./state";
import type { Core, I18n, Sound } from "./types";

export interface UiContext {
  core: Core;
  i18n: I18n;
  sound: Sound;
  renderer: Renderer;
  store: KeyValueStore;
  state: UiState;
  screens: Screens;
  /** `document.getElementById` that must find its element */
  $<T extends HTMLElement = HTMLElement>(id: string): T;
  t(key: string, vars?: Record<string, string | number>): string;
  /** a data entry's text; on a turned board `<field>Rotated` replaces `<field>` where the data has it */
  L(o: unknown, f?: string): string;
  /** what the text panels need */
  cards: CardEnv;
  toast(message: string): void;
  /** the desktop layout: a mouse and a big enough window */
  isDesk(): boolean;
  /** redraws the HUD, the palette state and the panels (filled in once the HUD exists) */
  refresh(): void;
  /** the panels were built for another language or layout: rebuild them on the next refresh */
  invalidate(): void;
}
