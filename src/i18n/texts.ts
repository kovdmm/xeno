// Every player-facing string, one JSON file per language (texts.<code>.json). The English file is the
// reference: every other file must have exactly the same keys, placeholders and HTML tags (tests check it).
import de from "./texts.de.json";
import en from "./texts.en.json";
import ru from "./texts.ru.json";
import sv from "./texts.sv.json";
import ua from "./texts.ua.json";
import type { Lang } from "./languages";

/** names and descriptions of one thing in the game; towers also carry their ultimates */
export interface TextEntry {
  name?: string;
  short?: string;
  desc?: string;
  label?: string;
  ults?: Record<string, TextEntry>;
}

export interface Texts {
  /** interface strings with {placeholders}; `credits` is a list of [role, name] rows */
  ui: { credits: [string, string][] } & Record<string, string | [string, string][]>;
  /** texts of the game data, by section and id (the ids of src/game/data/balance.json) */
  game: Record<"towers" | "enemies" | "difficulties" | "abilities" | "levels", Record<string, TextEntry>>;
}

export const TEXTS = { en, ru, de, ua, sv } as unknown as Record<Lang, Texts>;
