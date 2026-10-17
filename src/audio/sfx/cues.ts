// Which sound a game event makes. A pure function of the event: no playback, no state.
import type { GameEvent } from "../../game/types";

const SHOT: Record<string, string> = {
  gun: "gun",
  cannon: "cannon",
  missile: "missile",
  plasma: "plasma",
  rail: "rail",
  artillery: "arty",
};
const SMALL_BLAST = new Set(["shell", "bomblet", "missile", "plasma"]);
const BIG_BLAST = new Set(["artillery", "meteor", "bomb"]);
const CAST: Record<string, string> = {
  stasis: "stasis",
  meteor: "meteorcast",
  napalm: "fire",
  carpet: "plane",
  nuke: "siren",
};

/** The name of the sound for an event, or undefined when it is silent. */
export function cueOf(e: GameEvent): string | undefined {
  switch (e.type) {
    case "shot":
      return SHOT[e.tower.type];
    case "pulse":
      return e.freeze ? "freeze" : "frost";
    case "explode":
      return SMALL_BLAST.has(e.kind) ? "boom" : BIG_BLAST.has(e.kind) ? "bigboom" : "nuke";
    case "kill":
      return e.creep.boss ? "bosskill" : "pop";
    case "leak":
      return "leak";
    case "wave":
      return "wave";
    case "toast":
      return e.key === "cleared" ? "cleared" : undefined;
    case "built":
      return "build";
    case "upgraded":
      return e.tower.lvl === 4 && !e.tower.oc ? "ult" : "upgrade";
    case "sold":
      return "sell";
    case "cast":
      return CAST[e.ability];
    case "heal":
      return "heal";
    case "blink":
      return "blink";
    case "end":
      return e.won ? "victory" : "defeat";
    default:
      return undefined;
  }
}
