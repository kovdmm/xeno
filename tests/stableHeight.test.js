import { describe, it, expect } from "vitest";
import { createStableHeight } from "../src/stableHeight";

const setup = () => {
  const applied = [];
  const s = createStableHeight((px) => applied.push(px));
  return { s, applied, last: () => applied.at(-1) };
};

describe("stable height", () => {
  it("keeps the tallest height while only the height changes (a system bar sliding in)", () => {
    const { s, last } = setup();
    s.update(390, 844, true);
    s.update(390, 780, true);
    s.update(390, 700, true);
    expect(last()).toBe(844);
    s.update(390, 844, true);
    expect(last()).toBe(844);
  });

  it("grows when the window really gets taller", () => {
    const { s, last } = setup();
    s.update(390, 700, true);
    s.update(390, 800, true);
    expect(last()).toBe(800);
  });

  it("starts over when the width changes (the device was turned)", () => {
    const { s, last } = setup();
    s.update(390, 844, true);
    s.update(844, 390, true);
    expect(last()).toBe(390);
    s.update(844, 330, true);
    expect(last()).toBe(390);
  });

  it("reset() forgets the tallest height (leaving fullscreen makes the window shorter for good)", () => {
    const { s, last } = setup();
    s.update(390, 900, true);
    s.reset();
    s.update(390, 800, true);
    expect(last()).toBe(800);
  });

  it("does nothing in a normal browser tab: the layout follows the browser's bars", () => {
    const { s, last } = setup();
    s.update(390, 844, true);
    s.update(390, 700, false);
    expect(last()).toBe(null);
    s.update(390, 600, true); // and when enabled again it starts from the current size
    expect(last()).toBe(600);
  });
});
