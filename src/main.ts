// Composition root: builds the services, hands them to the interface, starts the game.
// `window.XT` is a debugging handle (and what the browser tests pre-seed with random streams before this runs);
// nothing in the app reads it.
import { createApp, type Hooks } from "./app";
import { registerWorker } from "./pwa";
import { createUi } from "./ui";

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

// Only in the built game (or with ?sw): a worker that serves cached files would show stale code while developing.
if (import.meta.env.PROD || location.search.includes("sw")) registerWorker(new URL("sw.js", document.baseURI).href);
