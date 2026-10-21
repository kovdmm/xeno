// Applies the release's save policy (saveVersion.ts) to the browser's storage, once, before anything reads it.
// Never throws: storage can be missing or refuse to be read or written (private windows, blocked site data).
import { SAVE } from "./saveVersion";

/** The parts of `Storage` it needs (so that tests can give a stand-in). */
export interface RawStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SCHEMA_KEY = "xt-schema";
/** Set when something was removed, until the player has read the notice (src/ui/notice.ts): "all" or "progress". */
export const NOTICE_KEY = "xt-notice";
/** The player's name is who they are in the records: it survives every reset. */
const KEPT = new Set(["xt-nick"]);
/** What "progress" removes: the best waves, the wins, the chosen map and difficulty, the opened maps, the saved record
 *  the name was asked for, the tutorial and the tips. The settings (language, sound, install offer) stay. */
const PROGRESS = /^xt-(best-|won-)|^xt-(level|diff|saved-best|allmaps|tutorial|hints)$/;

export type Policy = typeof SAVE;
export interface Outcome {
  /** the stored version was older and keys were removed */
  reset: boolean;
  removed: number;
}

export function applySaveVersion(storage: RawStorage | null, policy: Policy = SAVE): Outcome {
  const none: Outcome = { reset: false, removed: 0 };
  try {
    if (!storage) return none;
    const stored = Number(storage.getItem(SCHEMA_KEY) ?? 0);
    const current = Number.isFinite(stored) ? stored : 0;
    // the same version, or a newer one (a downgrade, a developer's browser): leave everything as it is
    if (current >= policy.version) return none;
    let removed = 0;
    if (policy.reset !== "none") {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (
          k &&
          k.startsWith("xt-") &&
          k !== SCHEMA_KEY &&
          !KEPT.has(k) &&
          (policy.reset === "all" || PROGRESS.test(k))
        )
          keys.push(k);
      }
      for (const k of keys) {
        storage.removeItem(k);
        removed++;
      }
    }
    storage.setItem(SCHEMA_KEY, String(policy.version));
    // a new player had nothing to lose: no notice
    if (removed) storage.setItem(NOTICE_KEY, policy.reset);
    return { reset: removed > 0, removed };
  } catch {
    return none;
  }
}

/** The browser's localStorage, or null when even touching it throws. */
export function browserStorage(): RawStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
