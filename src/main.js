// Composition root: builds the game from its parts. `window.XT` stays available for debugging and for the
// browser tests, which pre-seed `window.XT.rng` before this module runs.
import { installI18n } from "./i18n.js";
import { installCore } from "./core.js";
import { installRender } from "./render.js";
import { installAudio } from "./audio.js";
import { installUi } from "./ui.js";

const XT = (window.XT = window.XT || {});
installI18n(XT);
installCore(XT);
installRender(XT);
installAudio(XT); // needs the howler.js global, loaded by a classic script tag in index.html
installUi(XT);
