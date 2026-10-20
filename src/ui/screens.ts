// The full-page screens and dialogs. The game runs only when none of the pausing ones is open.

export const SCREENS = ["menu", "pause", "over", "help", "settings", "credits", "records"] as const;
export type ScreenId = (typeof SCREENS)[number] | "fsAsk";

export interface Screens {
  show(id: ScreenId): void;
  hide(id: ScreenId): void;
  isOpen(id: ScreenId): boolean;
  /** true while a screen covers the game */
  readonly covered: boolean;
}

/** `onChange` runs after every show/hide with the new `covered` value. */
export function createScreens(el: (id: string) => HTMLElement, onChange: (covered: boolean) => void): Screens {
  const covered = () => SCREENS.some((id) => !el(id).hidden);
  const set = (id: ScreenId, open: boolean) => {
    el(id).hidden = !open;
    onChange(covered());
  };
  return {
    show: (id) => set(id, true),
    hide: (id) => set(id, false),
    isOpen: (id) => !el(id).hidden,
    get covered() {
      return covered();
    },
  };
}
