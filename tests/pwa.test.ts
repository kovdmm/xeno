import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { createInstaller, isIos, type InstallState } from "../src/pwa";

const env = (o: Partial<{ standalone: boolean; userAgent: string; maxTouchPoints: number }> = {}) => ({ standalone: false, userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome", maxTouchPoints: 5, ...o });
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari";

/** the event Chrome sends when the app can be installed, with the parts the installer uses */
interface PromptEvent extends Event {
  calls: number;
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: string }>;
}

function promptEvent(outcome = "accepted") {
  const e = new Event("beforeinstallprompt", { cancelable: true }) as PromptEvent;
  e.calls = 0;
  e.prompt = async () => void e.calls++;
  e.userChoice = Promise.resolve({ outcome });
  return e;
}

describe("installer", () => {
  it("is unavailable until the browser offers installing", () => {
    expect(createInstaller(env(), new EventTarget(), () => {}).state()).toBe("unavailable");
  });

  it("becomes available on beforeinstallprompt and keeps the browser's own bar away", () => {
    const t = new EventTarget(),
      seen: InstallState[] = [];
    const inst = createInstaller(env(), t, (s) => seen.push(s));
    const e = promptEvent();
    t.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(inst.state()).toBe("available");
    expect(seen).toEqual(["available"]);
  });

  it("an offer the page caught before the app started counts: the button is ready at once", async () => {
    const early = promptEvent();
    const inst = createInstaller(env(), new EventTarget(), () => {}, early);
    expect(inst.state()).toBe("available");
    expect(await inst.prompt()).toBe(true);
    expect(early.calls).toBe(1);
  });

  it("prompt() shows the dialog once and reports the choice", async () => {
    const t = new EventTarget();
    const inst = createInstaller(env(), t, () => {});
    const e = promptEvent("accepted");
    t.dispatchEvent(e);
    expect(await inst.prompt()).toBe(true);
    expect(e.calls).toBe(1);
    expect(await inst.prompt()).toBe(false); // the event is spent
  });

  it("a dismissed dialog leaves nothing to offer until the browser asks again", async () => {
    const t = new EventTarget();
    const inst = createInstaller(env(), t, () => {});
    t.dispatchEvent(promptEvent("dismissed"));
    expect(await inst.prompt()).toBe(false);
    expect(inst.state()).toBe("unavailable");
  });

  it("appinstalled and standalone mode both mean installed", () => {
    const t = new EventTarget();
    const inst = createInstaller(env(), t, () => {});
    t.dispatchEvent(promptEvent());
    t.dispatchEvent(new Event("appinstalled"));
    expect(inst.state()).toBe("installed");
    expect(createInstaller(env({ standalone: true }), new EventTarget(), () => {}).state()).toBe("installed");
  });

  it("iPhone and iPad (also the desktop-mode iPad) get the manual instruction", () => {
    expect(isIos(env({ userAgent: IPHONE }))).toBe(true);
    expect(isIos(env({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 5 }))).toBe(true);
    expect(isIos(env({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X)", maxTouchPoints: 0 }))).toBe(false);
    expect(createInstaller(env({ userAgent: IPHONE }), new EventTarget(), () => {}).state()).toBe("ios");
  });
});

describe("manifest and index.html", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8"));
  const html = readFileSync("index.html", "utf8");

  it("has what browsers require to offer installing", () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    // not "fullscreen": on Android it hides the system bars so that swiping the nav menu in glitches
    expect(manifest.display).toBe("standalone");
    expect(manifest.display_override).toBeUndefined();
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("every icon file exists, with relative paths so any sub-folder works", () => {
    for (const i of manifest.icons) {
      expect(i.src.startsWith("/")).toBe(false);
      expect(existsSync("public/" + i.src), i.src).toBe(true);
    }
    expect(manifest.start_url.startsWith("/")).toBe(false);
  });

  it("the links sit in <head>: browsers ignore a manifest link in <body>", () => {
    const head = html.slice(0, html.indexOf("</head>"));
    for (const rel of ["manifest", "icon", "apple-touch-icon"]) expect(head).toContain(`rel="${rel}"`);
  });

  it("is linked from the page together with the iOS icon", () => {
    expect(html).toContain('rel="manifest" href="manifest.json"');
    expect(html).toContain('rel="apple-touch-icon" href="apple-touch-icon.png"');
    expect(existsSync("public/apple-touch-icon.png")).toBe(true);
    expect(existsSync("src/sw.ts")).toBe(true);
  });
});
