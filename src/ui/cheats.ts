// What the interface says about the extra cheat codes (the codes themselves are typed in input.ts, applied in the game).

/** The toast text of each code that is not "hesoyam". */
export const CHEAT_TEXT: Record<string, string> = {
  bagowpw: "cheatMaps",
  aspirine: "cheatGod",
  lxgiwyl: "cheatFree",
  crazytown: "cheatGrumble",
};

const GRUMBLE_KEYS = ["grumble0", "grumble1", "grumble2", "grumble3", "grumble4", "grumble5"];

/** The phrases the enemies grumble in the current language (cheat "crazytown"). */
export const grumbles = (t: (k: string) => string): string[] => GRUMBLE_KEYS.map((k) => t(k));
