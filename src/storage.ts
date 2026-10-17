// A tiny persistent key-value store. localStorage can be missing or throw (private windows, blocked site
// data), so every access is guarded: the game works without it, it just forgets settings.

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** localStorage that never throws. */
export function localStorageStore(): KeyValueStore {
  return {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* storage unavailable: nothing to do */
      }
    },
  };
}
