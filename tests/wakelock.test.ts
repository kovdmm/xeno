import { describe, it, expect } from "vitest";
import { createWakeLock } from "../src/pwa";

/** a navigator whose wakeLock hands out sentinels we can inspect */
function fakeNav() {
  const sentinels: {
    released: boolean;
    release(): Promise<void>;
    addEventListener(t: "release", cb: () => void): void;
  }[] = [];
  const nav = {
    wakeLock: {
      request: async (_type: "screen") => {
        const listeners: (() => void)[] = [];
        const s = {
          released: false,
          release: async () => {
            s.released = true;
            listeners.forEach((f) => f());
          },
          addEventListener: (_t: "release", cb: () => void) => void listeners.push(cb),
        };
        sentinels.push(s);
        return s;
      },
    },
  };
  return { nav, sentinels };
}

describe("wake lock", () => {
  it("is taken while playing and released on pause", async () => {
    const { nav, sentinels } = fakeNav();
    const w = createWakeLock(nav, () => true);
    await w.sync(true);
    expect(w.held()).toBe(true);
    await w.sync(true);
    expect(sentinels.length).toBe(1); // not requested twice
    await w.sync(false);
    expect(w.held()).toBe(false);
    expect(sentinels[0].released).toBe(true);
  });

  it("is not taken in a hidden tab, and is taken when the tab is back", async () => {
    const { nav, sentinels } = fakeNav();
    let visible = false;
    const w = createWakeLock(nav, () => visible);
    await w.sync(true);
    expect(sentinels.length).toBe(0);
    visible = true;
    await w.sync();
    expect(w.held()).toBe(true);
  });

  it("is requested again after the browser drops it", async () => {
    const { nav, sentinels } = fakeNav();
    const w = createWakeLock(nav, () => true);
    await w.sync(true);
    await sentinels[0].release(); // the tab was hidden: the browser released the lock
    expect(w.held()).toBe(false);
    await w.sync(true);
    expect(sentinels.length).toBe(2);
    expect(w.held()).toBe(true);
  });

  it("does nothing where the API is missing or refuses", async () => {
    await expect(createWakeLock({}, () => true).sync(true)).resolves.toBeUndefined();
    const refusing = { wakeLock: { request: async () => Promise.reject(new Error("NotAllowedError")) } };
    const w = createWakeLock(refusing, () => true);
    await expect(w.sync(true)).resolves.toBeUndefined();
    expect(w.held()).toBe(false);
  });
});
