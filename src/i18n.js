// Adapter that exposes the translator (src/i18n) to the rest of the app as `XT.i18n`: the browser's language
// list and localStorage are plugged in here. Temporary: it goes away once main.js wires these parts itself.
import { createTranslator } from "./i18n/translator";
import { localStorageStore } from "./storage";

export function installI18n(XT) {
  const tr = createTranslator({
    storage: localStorageStore(),
    browserLanguages:
      navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""],
  });
  XT.i18n = {
    /** codes of the supported languages; `LANGUAGES` also has the native names for the selector */
    LANGS: tr.languages.map((l) => l.code),
    LANGUAGES: tr.languages,
    get lang() {
      return tr.lang;
    },
    get htmlLang() {
      return tr.htmlLang;
    },
    setLang: tr.setLang,
    t: tr.t,
    gameText: tr.gameText,
    gameFields: tr.gameFields,
    /** the name/desc/short/label of a data object; the objects from XT.core read the current language live */
    L: (o, f = "name") => o[f],
  };
}
