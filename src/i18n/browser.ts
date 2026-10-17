// The translator wired to the browser: the language list of the browser and localStorage.
import type { KeyValueStore } from "../storage";
import { createTranslator } from "./translator";

export function createBrowserI18n(storage: KeyValueStore) {
  const tr = createTranslator({
    storage,
    browserLanguages:
      navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""],
  });
  return {
    /** the supported languages with their native names (for the selector) */
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
    /** the name/desc/short/label of a data entry; entries from the core read the current language live */
    L: (o: Record<string, string>, f = "name") => o[f],
  };
}

export type BrowserI18n = ReturnType<typeof createBrowserI18n>;
