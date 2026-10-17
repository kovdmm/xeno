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

export function createInstaller(env: Env, target: EventTarget, onChange: (s: InstallState) => void) {
  let deferred: InstallPromptEvent | null = null;
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
