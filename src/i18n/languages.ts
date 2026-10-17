// The languages the game speaks, and how the starting one is chosen.

export const LANGUAGES = [
  { code: "en", name: "English", html: "en" },
  { code: "ru", name: "Русский", html: "ru" },
  { code: "de", name: "Deutsch", html: "de" },
  { code: "ua", name: "Українська", html: "uk" },
  { code: "sv", name: "Svenska", html: "sv" },
] as const;

/** `code` is what the text files and saved settings use; `html` is the BCP 47 tag for `<html lang>`. */
export type Lang = (typeof LANGUAGES)[number]["code"];

/** English is the default and the fallback: it is the one language that is always complete. */
export const DEFAULT_LANGUAGE: Lang = "en";

export const LANG_CODES: Lang[] = LANGUAGES.map((l) => l.code);
export const isLang = (x: unknown): x is Lang => typeof x === "string" && (LANG_CODES as string[]).includes(x);
export const htmlLang = (l: Lang): string => LANGUAGES.find((x) => x.code === l)!.html;

/** Browsers say "uk" for Ukrainian; our files and codes say "ua". */
const BROWSER_ALIASES: Record<string, Lang> = { uk: "ua" };

/** The game language for a browser language tag such as "de-AT" or "uk-UA", or null if we do not have it. */
export function languageFromTag(tag: string): Lang | null {
  const p = String(tag || "")
    .toLowerCase()
    .slice(0, 2);
  return BROWSER_ALIASES[p] ?? (isLang(p) ? p : null);
}

/** The starting language: a saved choice wins, then the first browser language we know, otherwise English. */
export function detectLanguage(saved: string | null, browserLanguages: readonly string[]): Lang {
  if (isLang(saved)) return saved;
  for (const tag of browserLanguages) {
    const l = languageFromTag(tag);
    if (l) return l;
  }
  return DEFAULT_LANGUAGE;
}
