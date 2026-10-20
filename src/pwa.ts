// Installing the game as an app. The browser decides when installing is possible; this only follows
// its events and reports one of four states, so the UI can stay a plain function of the state.

export type InstallState =
  | "installed" // already running as an installed app
  | "available" // the browser can show its install dialog right now
  | "ios" // iPhone/iPad Safari: no dialog, the player uses Share → Add to Home Screen
  | "unavailable"; // nothing to offer (desktop Firefox, in-app browsers, not secure context ...)

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export interface Env {
  standalone: boolean;
  userAgent: string;
  maxTouchPoints: number;
}

export const isIos = (e: Env) =>
  /iPad|iPhone|iPod/.test(e.userAgent) || (/Macintosh/.test(e.userAgent) && e.maxTouchPoints > 1);

/**
 * `early` is an install prompt the page caught before the app started (see index.html): the browser sends
 * it once, and it may well arrive while the scripts are still loading.
 */
export function createInstaller(
  env: Env,
  target: EventTarget,
  onChange: (s: InstallState) => void,
  early: Event | null = null,
) {
  let deferred = early as InstallPromptEvent | null;
  let installed = env.standalone;
  const state = (): InstallState =>
    installed ? "installed" : deferred ? "available" : isIos(env) ? "ios" : "unavailable";
  const emit = () => onChange(state());

  target.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep the event: the browser's own mini-bar would pop up at a random moment
    deferred = e as InstallPromptEvent;
    emit();
  });
  target.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });

  return {
    state,
    /** Shows the browser's install dialog; resolves true if the player accepted. */
    async prompt(): Promise<boolean> {
      const p = deferred;
      if (!p) return false;
      deferred = null; // an event can be used once
      await p.prompt();
      const { outcome } = await p.userChoice;
      if (outcome !== "accepted") emit();
      return outcome === "accepted";
    },
  };
}

interface WakeLockSentinelLike {
  released: boolean;
  release(): Promise<void>;
  addEventListener(type: "release", cb: () => void): void;
}
interface WakeLockNavigator {
  wakeLock?: { request(type: "screen"): Promise<WakeLockSentinelLike> };
}

/**
 * Keeps the screen from dimming while the last `sync(true)` is in force (the Wake Lock API). The browser drops
 * the lock itself when the tab is hidden, so `sync` has to be called again when the tab comes back. Where the
 * API is missing or refuses (no permission, low battery), nothing happens and nothing is thrown.
 */
export function createWakeLock(nav: WakeLockNavigator, isVisible: () => boolean) {
  let sentinel: WakeLockSentinelLike | null = null;
  let pending = false;
  let want = false;

  async function sync(wanted: boolean = want): Promise<void> {
    want = wanted;
    if (!nav.wakeLock) return;
    if (want && isVisible()) {
      if ((sentinel && !sentinel.released) || pending) return;
      pending = true;
      try {
        const s = await nav.wakeLock.request("screen");
        s.addEventListener("release", () => {
          if (sentinel === s) sentinel = null;
        });
        // the player may have paused while the browser was thinking
        if (want && isVisible()) sentinel = s;
        else await s.release();
      } catch {
        /* refused: the screen may dim, which is no worse than before */
      } finally {
        pending = false;
      }
    } else if (sentinel) {
      const s = sentinel;
      sentinel = null;
      try {
        await s.release();
      } catch {
        /* already released */
      }
    }
  }

  return { sync, held: () => !!sentinel && !sentinel.released };
}

/** Registers the service worker that makes the game start offline. Never throws. */
export async function registerWorker(url = "sw.js"): Promise<boolean> {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return false;
  try {
    await navigator.serviceWorker.register(url);
    return true;
  } catch {
    return false;
  }
}
