import { describe, it, expect } from "vitest";
import { shouldOfferInstall } from "../src/pwa";

describe("the install suggestion", () => {
  it("is made on a phone where installing works", () => {
    expect(shouldOfferInstall("available", false, true)).toBe(true);
    expect(shouldOfferInstall("ios", false, true)).toBe(true);
  });

  it("is not made again after the player said no", () => {
    expect(shouldOfferInstall("available", true, true)).toBe(false);
    expect(shouldOfferInstall("ios", true, true)).toBe(false);
  });

  it("is not made on a desktop, in an installed app or where there is nothing to offer", () => {
    expect(shouldOfferInstall("available", false, false)).toBe(false);
    expect(shouldOfferInstall("installed", false, true)).toBe(false);
    expect(shouldOfferInstall("unavailable", false, true)).toBe(false);
  });
});
