// Composition root: builds the services, hands them to the interface, starts the game.
// `window.XT` is a debugging handle (and what the browser tests pre-seed with random streams before this runs);
// nothing in the app reads it.
import { createApp, type Hooks } from "./app";
import { registerWorker } from "./pwa";
import { applySaveVersion, browserStorage } from "./saveMigration";
import { createUi } from "./ui";

// what the browser kept from older releases is reset (or not) by this release's policy before anything reads it
applySaveVersion(browserStorage());

const hooks = ((window as unknown as { XT?: Hooks }).XT ?? {}) as Hooks;
const app = createApp(hooks);
const ui = createUi({
  core: app.core,
  i18n: app.i18n,
  sound: app.audio, // silent when howler.js did not load
  createRenderer: app.createRenderer,
  store: app.store,
});
(window as unknown as { XT: unknown }).XT = { ...hooks, ...app, ui };

// Show the page once it is built: texts are in, the layout is measured, the fonts of the menu text are there.
// `fonts.ready` alone is not enough: it settles at once while no font has started loading, and the faces are
// loaded explicitly here. A slow network is waited for up to FONT_WAIT, a blocked one must not hold the game back.
const FONT_WAIT = 3000;
const FACES = ['1em "Russo One"', '400 1em "PT Sans Narrow"', '700 1em "PT Sans Narrow"'];
const show = () => document.documentElement.classList.add("ready");
const fontsIn = document.fonts
  ? Promise.allSettled([...FACES.map((f) => document.fonts.load(f)), document.fonts.ready])
  : Promise.resolve();
Promise.race([fontsIn, new Promise((r) => setTimeout(r, FONT_WAIT))]).then(show, show);

// Only in the built game (or with ?sw): a worker that serves cached files would show stale code while developing.
if (import.meta.env.PROD || location.search.includes("sw")) registerWorker(new URL("sw.js", document.baseURI).href);
