import { describe, it, expect } from "vitest";
import { ANONYMOUS, NICK_MAX, nickKey, sanitizeNick } from "../src/nick";

describe("a name in the table", () => {
  it("keeps letters of any script, digits and a few marks", () => {
    for (const ok of ["Ann", "Zoë", "Дмитрий", "Олена-Марія", "王小明", "R2.D2", "o'neil", "a_b c"])
      expect(sanitizeNick(ok)).toBe(ok);
  });

  it("composes accents so that one name is one name", () => {
    expect(sanitizeNick("Zoë")).toBe("Zoë");
  });

  it("throws away markup, controls, bidi marks, emoji and other symbols", () => {
    expect(sanitizeNick("<b>Evil</b>")).toBe("bEvilb");
    expect(sanitizeNick("a\u0000b‮c​d")).toBe("abcd");
    expect(sanitizeNick("Joe 🙂")).toBe("Joe");
    expect(sanitizeNick("x\ny\tz")).toBe("xyz");
    expect(sanitizeNick("<script>alert(1)</script>")).not.toMatch(/[<>()/]/);
  });

  it("collapses and trims spaces, cuts to the length", () => {
    expect(sanitizeNick("   a    b   ")).toBe("a b");
    const long = sanitizeNick("x".repeat(100));
    expect(Array.from(long)).toHaveLength(NICK_MAX);
    expect(Array.from(sanitizeNick("😀".repeat(40) + "ab"))).toHaveLength(2);
  });

  it("removes stacks of combining marks", () => {
    expect(sanitizeNick("a" + "́".repeat(30) + "b")).toBe("áb"); // the first accent composes with its letter and stays, the other 29 go
    expect(sanitizeNick("é")).toBe("é"); // one accent stays
  });

  it("becomes Anonymous when nothing is left, when it is not text, or when it is blocked", () => {
    for (const v of ["", "   ", "🙂🙂", "<>", null, undefined, 5, {}, ["x"]]) expect(sanitizeNick(v)).toBe(ANONYMOUS);
    expect(sanitizeNick("Hitler")).toBe(ANONYMOUS);
    expect(sanitizeNick("grape")).toBe("grape");
    expect(sanitizeNick("f.u.c.k")).toBe(ANONYMOUS);
    expect(sanitizeNick("пиздец")).toBe(ANONYMOUS);
    expect(sanitizeNick("Scunthorpe")).toBe("Scunthorpe"); // a short list on purpose: no place names or grapes lost
  });

  it("names are the same by their lower case", () => {
    expect(nickKey("Ann")).toBe(nickKey("ANN"));
  });
});
