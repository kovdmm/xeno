import { describe, expect, it } from "vitest";
import { better } from "../src/ranking";
import { readNick, writeNick } from "../src/ui/nickStore";

const r = (o: Partial<Parameters<typeof better>[0]> = {}) => ({
  won: false,
  cleared: 10,
  score: 100,
  seconds: 60,
  ...o,
});

describe("which result is better", () => {
  it("a win, then the waves cleared, then the score, then the shorter game", () => {
    expect(better(r({ won: true, cleared: 1 }), r({ cleared: 99 }))).toBe(true);
    expect(better(r({ cleared: 11 }), r({ cleared: 10, score: 9999 }))).toBe(true);
    expect(better(r({ score: 101 }), r({ seconds: 1 }))).toBe(true);
    expect(better(r({ seconds: 59 }), r())).toBe(true);
  });

  it("an equal result is not better, and a worse one is not", () => {
    expect(better(r(), r())).toBe(false);
    expect(better(r({ cleared: 9 }), r())).toBe(false);
    expect(better(r({ seconds: 61 }), r())).toBe(false);
  });
});

describe("the player's name", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => void m.set(k, v) };
  };

  it("is empty until it is given, then kept as the service would clean it", () => {
    const store = memory();
    expect(readNick(store)).toBe("");
    expect(writeNick(store, "  Ann   <b>  ")).toBe("Ann b");
    expect(readNick(store)).toBe("Ann b");
  });

  it("a name that is empty or not allowed is not kept: the player is asked again", () => {
    const store = memory();
    writeNick(store, "Ann");
    expect(writeNick(store, "   ")).toBe("");
    expect(readNick(store)).toBe("");
    expect(writeNick(store, "<>")).toBe("");
  });
});
