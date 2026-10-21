// The player's name for the records table: asked once (after the first finished game, before the first record is
// saved), then used silently; it can be changed in the settings. Kept in the browser only.
import { ANONYMOUS, NICK_MAX, sanitizeNick } from "../nick";
import type { KeyValueStore } from "../storage";

const NICK_KEY = "xt-nick";

export { NICK_MAX };

/** The name, or "" while the player has not given one. */
export const readNick = (store: KeyValueStore): string => store.get(NICK_KEY) ?? "";

/**
 * Remembers a name, cleaned the way the service cleans it. A name that is empty or not allowed is not kept (the player
 * is asked again). Returns the name that is kept.
 */
export function writeNick(store: KeyValueStore, raw: string): string {
  const nick = sanitizeNick(raw);
  const kept = nick === ANONYMOUS ? "" : nick;
  store.set(NICK_KEY, kept);
  return kept;
}
