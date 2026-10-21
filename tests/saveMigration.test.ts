// The release's reset of what the browser kept: which keys go, which stay, and that it never throws.
import { describe, expect, it } from "vitest";
import { applySaveVersion, NOTICE_KEY, SCHEMA_KEY, type RawStorage } from "../src/saveMigration";
import { SAVE } from "../src/saveVersion";

const fake = (init: Record<string, string> = {}, fail: Partial<Record<keyof RawStorage, boolean>> = {}) => {
  const m = new Map(Object.entries(init));
  const s: RawStorage & { data: Map<string, string> } = {
    data: m,
    get length() {
      if (fail.length) throw new Error("blocked");
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
    getItem(k) {
      if (fail.getItem) throw new Error("blocked");
      return m.get(k) ?? null;
    },
    setItem(k, v) {
      if (fail.setItem) throw new Error("blocked");
      m.set(k, v);
    },
    removeItem(k) {
      if (fail.removeItem) throw new Error("blocked");
      m.delete(k);
    },
  };
  return s;
};
const OLD = {
  "xt-best-crossroads-easy": "70",
  "xt-won-crossroads-easy": "1",
  "xt-level": "fronts",
  "xt-diff": "hard",
  "xt-allmaps": "1",
  "xt-saved-best": "{}",
  "xt-tutorial": "done",
  "xt-hints": "{}",
  "xt-lang": "ru",
  "xt-vol": "0.3",
  "xt-mvol": "0.2",
  "xt-mute": "1",
  "xt-install-dismissed": "1",
  "xt-nick": "Dmitry",
  other: "not ours",
};
const policy = (reset: "all" | "progress" | "none", version = 3) => ({ version, reset });

describe("the save version", () => {
  it("this release resets everything but the name, and the version is a positive whole number", () => {
    expect(SAVE.reset).toBe("all");
    expect(Number.isInteger(SAVE.version) && SAVE.version >= 1).toBe(true);
  });

  it("a browser from before versions (no xt-schema): every xt- key goes but the name, the version is written", () => {
    const s = fake(OLD);
    const r = applySaveVersion(s, policy("all"));
    expect(r).toEqual({ reset: true, removed: 13 });
    expect([...s.data.keys()].sort()).toEqual([NOTICE_KEY, SCHEMA_KEY, "other", "xt-nick"].sort());
    expect(s.data.get("xt-nick")).toBe("Dmitry");
    expect(s.data.get(SCHEMA_KEY)).toBe("3");
    expect(s.data.get(NOTICE_KEY)).toBe("all");
  });

  it("an older version is reset the same way", () => {
    const s = fake({ ...OLD, [SCHEMA_KEY]: "2" });
    expect(applySaveVersion(s, policy("all")).reset).toBe(true);
    expect(s.data.get(SCHEMA_KEY)).toBe("3");
  });

  it("'progress' removes progress, wins, records and the tutorial flags and keeps the settings and the name", () => {
    const s = fake(OLD);
    applySaveVersion(s, policy("progress"));
    expect([...s.data.keys()].sort()).toEqual(
      [
        NOTICE_KEY,
        SCHEMA_KEY,
        "other",
        "xt-install-dismissed",
        "xt-lang",
        "xt-mute",
        "xt-mvol",
        "xt-nick",
        "xt-vol",
      ].sort(),
    );
    expect(s.data.get(NOTICE_KEY)).toBe("progress");
  });

  it("'none' only writes the version", () => {
    const s = fake(OLD);
    expect(applySaveVersion(s, policy("none"))).toEqual({ reset: false, removed: 0 });
    expect(s.data.get("xt-best-crossroads-easy")).toBe("70");
    expect(s.data.get(SCHEMA_KEY)).toBe("3");
    expect(s.data.has(NOTICE_KEY)).toBe(false);
  });

  it("the same version, or a newer one, is left alone, even the version itself", () => {
    for (const v of ["3", "4", "99"]) {
      const s = fake({ ...OLD, [SCHEMA_KEY]: v });
      const before = new Map(s.data);
      expect(applySaveVersion(s, policy("all"))).toEqual({ reset: false, removed: 0 });
      expect(s.data).toEqual(before);
    }
  });

  it("a new player has nothing to lose: the version is written and there is no notice", () => {
    const s = fake();
    expect(applySaveVersion(s, policy("all"))).toEqual({ reset: false, removed: 0 });
    expect([...s.data.entries()]).toEqual([[SCHEMA_KEY, "3"]]);
  });

  it("it is done once: a second start finds the version and does nothing", () => {
    const s = fake(OLD);
    applySaveVersion(s, policy("all"));
    s.data.set("xt-best-corner-easy", "12"); // played since
    expect(applySaveVersion(s, policy("all")).reset).toBe(false);
    expect(s.data.get("xt-best-corner-easy")).toBe("12");
  });

  it("a version that is not a number counts as none", () => {
    const s = fake({ ...OLD, [SCHEMA_KEY]: "banana" });
    expect(applySaveVersion(s, policy("all")).reset).toBe(true);
  });

  it("never throws: no storage, or storage that refuses to be read, listed, written or cleared", () => {
    expect(applySaveVersion(null, policy("all"))).toEqual({ reset: false, removed: 0 });
    for (const what of ["getItem", "length", "setItem", "removeItem"] as const)
      expect(() => applySaveVersion(fake(OLD, { [what]: true }), policy("all")), what).not.toThrow();
  });
});
