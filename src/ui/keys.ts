// Keyboard: which key the player means, whatever the layout, and what it does. All of it is pure.

/** Letters of other layouts that sit on the key of a Latin hotkey (Russian; Ukrainian "і" shares the key of "ы"). */
const LAYOUT: Record<string, string> = {
  й: "q",
  ц: "w",
  у: "e",
  к: "r",
  е: "t",
  г: "u",
  ы: "s",
  і: "s",
  т: "n",
  а: "f",
  ь: "m",
};

/** The hotkey letter of a pressed key (lower case, with the layouts we know mapped to the Latin letter). */
export function hotkey(key: string): string {
  const k = key.toLowerCase();
  return LAYOUT[k] || k;
}

/** The digit of a number-row or keypad key, from its `code`: on some layouts (AZERTY) the row types symbols. */
export function physicalDigit(code: string | undefined): string {
  const m = code && /^(?:Digit|Numpad)(\d)$/.exec(code);
  return m ? m[1] : "";
}

/** The physical letter ("a".."z") of a KeyboardEvent, from its `code`: it does not depend on the layout. */
export function physicalLetter(code: string | undefined): string {
  return code && code.startsWith("Key") ? code.slice(3).toLowerCase() : "";
}

/**
 * Cheat codes typed on the keyboard. While a code is being typed its letters are swallowed, so that
 * "hesoyam" does not sell (S), switch the sound (M) and so on.
 */
export class CheatTyper {
  private buf = "";
  constructor(
    private codes: readonly string[],
    private onCode: (code: string) => void,
  ) {}

  /** Feeds one physical letter; true if it belongs to a cheat code in progress (the caller must not act on it). */
  feed(ch: string): boolean {
    const nb = this.buf + ch;
    if (this.codes.some((c) => c.startsWith(nb))) {
      this.buf = nb;
      if (this.codes.includes(nb)) {
        this.buf = "";
        this.onCode(nb);
      }
      return true;
    }
    this.buf = this.codes.some((c) => c.startsWith(ch)) ? ch : "";
    return !!this.buf;
  }
}

export interface OpenScreens {
  settings: boolean;
  help: boolean;
  pause: boolean;
  menu: boolean;
  over: boolean;
}

export type EscapeAction = "close-settings" | "close-help" | "resume" | "nothing" | "clear-picks" | "pause";

/** What Escape does: it closes the topmost thing, and only pauses when there is nothing to close. */
export function escapeAction(open: OpenScreens, hasPicks: boolean): EscapeAction {
  if (open.settings) return "close-settings";
  if (open.help) return "close-help";
  if (open.pause) return "resume";
  if (open.menu || open.over) return "nothing";
  if (hasPicks) return "clear-picks";
  return "pause";
}

/** What Space does: toggles the pause screen, unless the title or the end screen is up. */
export function spaceAction(open: OpenScreens): "resume" | "pause" | "nothing" {
  if (open.pause) return "resume";
  return open.menu || open.over ? "nothing" : "pause";
}
