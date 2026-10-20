import { describe, it, expect } from "vitest";
import { createGame } from "../src/game/game";
import { GAME_DIGEST } from "../src/game/digests";
import { gameDigest, scriptedGame } from "../src/game/selfCheck";

describe("seeded games", () => {
  it("the same seed gives the same game, whatever was played before", () => {
    const fresh = scriptedGame(createGame({ seed: 99 }), 5);
    const g = createGame({ seed: 1 }); // another stream, and a game already played in it
    scriptedGame(g, 77, "crossroads", 1500);
    expect(scriptedGame(g, 5)).toEqual(fresh);
  });

  it("does not depend on Math.random", () => {
    expect(scriptedGame(createGame(), 5)).toEqual(scriptedGame(createGame(), 5));
  });

  it("another seed gives another game", () => {
    const g = createGame();
    expect(scriptedGame(g, 5).sum).not.toBe(scriptedGame(g, 6).sum);
  });

  it("the script really plays: towers stand, waves come, enemies are on the board", () => {
    const r = scriptedGame(createGame(), 5);
    expect(r.towers).toBeGreaterThanOrEqual(8);
    expect(r.wave).toBeGreaterThan(10);
    expect(r.t).toBeGreaterThan(90);
  });

  it("the end state is the recorded one, bit for bit", () => {
    expect(gameDigest()).toBe(GAME_DIGEST);
  });
});
