// The translator: the current language, lookups with a fallback to English, and the saved choice.
import type { KeyValueStore } from "../storage";
import { DEFAULT_LANGUAGE, LANGUAGES, detectLanguage, htmlLang, isLang, type Lang } from "./languages";
import { TEXTS, type Texts } from "./texts";

export interface Translator {
  readonly lang: Lang;
  /** value for `<html lang>` (differs from `lang` for Ukrainian) */
  readonly htmlLang: string;
  readonly languages: typeof LANGUAGES;
  /** switches language and remembers it; returns false (and changes nothing) for an unknown code */
  setLang(lang: string): boolean;
  /** An interface string with {placeholders} filled in; the key itself if no language has it. */
  t(key: string, vars?: Record<string, string | number>): any;
  /** A text of the game data by path, e.g. "towers.gun.ults.mini.desc"; the path itself if missing. */
  gameText(path: string): string;
  /** The text fields an entry has (e.g. name, desc), as the English file defines them. */
  gameFields(path: string): string[];
}

const SAVED_KEY = "xt-lang";

const walk = (root: unknown, path: string): any =>
  path.split(".").reduce((o: any, k) => (o && typeof o === "object" ? o[k] : undefined), root);

export interface TranslatorOptions {
  storage: KeyValueStore;
  /** `navigator.languages`; picks the starting language when nothing is saved */
  browserLanguages: readonly string[];
  texts?: Record<Lang, Texts>;
}

export function createTranslator({ storage, browserLanguages, texts = TEXTS }: TranslatorOptions): Translator {
  let lang: Lang = detectLanguage(storage.get(SAVED_KEY), browserLanguages);
  const en = texts[DEFAULT_LANGUAGE];

  return {
    get lang() {
      return lang;
    },
    get htmlLang() {
      return htmlLang(lang);
    },
    languages: LANGUAGES,

    setLang(l) {
      if (!isLang(l)) return false;
      lang = l;
      storage.set(SAVED_KEY, l);
      return true;
    },

    t(key, vars) {
      const x = texts[lang].ui[key] ?? en.ui[key] ?? key;
      if (typeof x !== "string" || !vars) return x;
      let s: string = x;
      for (const n in vars) s = s.split("{" + n + "}").join(String(vars[n]));
      return s;
    },

    gameText(path) {
      return walk(texts[lang].game, path) ?? walk(en.game, path) ?? path;
    },

    gameFields(path) {
      const e = walk(en.game, path);
      return e && typeof e === "object" ? Object.keys(e).filter((k) => typeof e[k] === "string") : [];
    },
  };
}
