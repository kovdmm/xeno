/* Xeno-Tactics — the interface: screens (title, pause, game over), HUD, tray, input, settings, the main loop.
   It talks to the game only through `core` (commands, queries, events), draws only through the renderer and
   plays sound only through `sound`; all of them are handed in. This file builds the shared context and wires
   the parts together; each part lives in its own module. */
import { installAppMode } from "./appMode";
import type { CardEnv } from "./cards";
import type { UiContext } from "./context";
import { createCommands } from "./commands";
import { createHud } from "./hud";
import { installInput } from "./input";
import { createApplyLang } from "./language";
import { DESK_QUERY, installLayout } from "./layout";
import { startLoop } from "./loop";
import { createPalette } from "./palette";
import { createProgress } from "./progress";
import { createRecords, type Records } from "./records";
import { createScoresClient } from "../scores";
import { createScreens } from "./screens";
import { createSession } from "./session";
import { installCampaign } from "./campaign";
import { installXenopedia } from "./xenopedia";
import { installSettings } from "./settings";
import { installSoundControls } from "./soundControls";
import { createState } from "./state";
import { routeLabelKey } from "./routes";
import type { Sound, UiDeps } from "./types";

/** Used when there is no sound backend: the game runs silently. */
const SILENT: Sound = {
  ok: false,
  muted: true,
  volume: 0,
  musicVolume: 0,
  play() {},
  update() {},
  setMuted() {},
  setVolume() {},
  setMusicVolume() {},
};

export function createUi(deps: UiDeps) {
  const { core, i18n, store } = deps;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  const progress = createProgress(
    store,
    core.DKEYS,
    core.LKEYS.map((id) => ({ id, finalWaves: core.LEVELS[id].finalWaves })),
    core.lockOf,
  );
  const { diff, level } = progress.readChoice();
  const state = createState(diff, level, progress.bestOf(level, diff));
  const renderer = deps.createRenderer($<HTMLCanvasElement>("field"));
  const desk = matchMedia(DESK_QUERY);

  const t = (k: string, v?: Record<string, string | number>) => i18n.t(k, v) as string;
  // a data entry's text; when the board is turned, `<field>Rotated` (if the data has one) replaces `<field>`:
  // "left to right" becomes "top to bottom", "the chosen row" becomes "the chosen column"
  const L = (o: unknown, f = "name") => {
    const rotated = (o as Record<string, string | null | undefined>)[f + "Rotated"];
    return state.rotated && rotated != null ? rotated : i18n.L(o, f);
  };
  const cards: CardEnv = {
    core,
    t,
    L,
    routeLabel: (r) => t(routeLabelKey(core.ROUTES[r], state.rotated)),
    tierColor: (l, type, ult) => renderer.tierColor(l, type, ult),
  };

  let toastTimer: ReturnType<typeof setTimeout>;
  const ui: UiContext = {
    core,
    i18n,
    sound: deps.sound ?? SILENT,
    renderer,
    store,
    state,
    screens: createScreens($, () => {
      state.paused = ui.screens.covered;
      hud.drawSpeed();
    }),
    $,
    t,
    L,
    cards,
    where: (lv = state.level, d = state.diff) => `${L(core.LEVELS[lv])} · ${L(core.DIFF[d as keyof typeof core.DIFF])}`,
    toast(message) {
      const el = $("toast");
      el.textContent = message;
      el.style.opacity = "1";
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => (el.style.opacity = "0"), 1800);
    },
    isDesk: () => desk.matches,
    refresh: () => hud.refresh(),
    invalidate: () => hud.invalidate(),
  };

  // The parts. The ones that need each other receive small callbacks, resolved when they are used.
  const palette = createPalette(ui, {
    build: (n) => commands.selectBuild(n),
    ability: (k) => commands.selectAbility(k),
  });
  const hud = createHud(ui, palette);
  const commands = createCommands(ui, hud.drawSpeed);
  const scoresClient = deps.scores ?? createScoresClient();
  let records: Records;
  const session = createSession(ui, progress, () => applyLang(), {
    takeSeed: (l, d) => records.takeSeed(l, d),
    onEnd: () => records.onEnd(),
    ask: (next) => records.ask(next),
  });
  records = createRecords(ui, scoresClient, { onSeed: () => session.reseed() });
  const soundControls = installSoundControls(ui);
  const layout = { refit: () => {}, fit: () => {} };
  const appMode = installAppMode(ui, () => layout.refit());
  installCampaign(ui, progress, session);
  const xenopedia = installXenopedia(ui);
  const settings = installSettings(ui, {
    applyLang: () => applyLang(),
    redrawOnOpen() {
      appMode.drawFs();
      appMode.drawInstall();
      soundControls.draw();
    },
  });
  const applyLang = createApplyLang(ui, {
    redraw: [soundControls.draw, appMode.drawFs, appMode.drawInstall, hud.drawSpeed],
    rebuildPalette: palette.build,
    renderOver: session.renderOver,
    openMenu: session.openMenu,
  });
  Object.assign(
    layout,
    installLayout(ui, palette, desk, () => {
      // texts that mention directions were built for the old orientation: the palette tooltips and both panels
      palette.build();
      ui.invalidate();
      ui.refresh(); // the new buttons are empty until filled; the field is measured right after
    }),
  );
  installInput(ui, {
    commands,
    menu: {
      open: () => session.leave(session.openMenu),
      newGame: () => session.leave(session.newGame),
      openSettings: settings.openSettings,
      openHelp: settings.openHelp,
    },
    toggleSound: soundControls.toggleSound,
    pedia: xenopedia.open,
    closeScreen: (id) => ui.screens.hide(id),
  });
  new ResizeObserver(() => renderer.resize()).observe($("field"));

  // start
  session.newGame();
  applyLang();
  session.openMenu();
  appMode.askFullscreen();
  layout.fit();
  renderer.resize();
  startLoop(ui);

  return { newGame: session.newGame, refresh: hud.refresh, openMenu: session.openMenu };
}
