// Reusable game setups. Every scene runs in the page against XT.core and leaves the game running.
// Scenes are serialised with Function#toString, so they must not use closures over module scope.

import type { GameCore } from "../src/core";
import type { TowerType } from "../src/game/types";

/** [type, x, y, upgrades] */
type Plan = [TowerType, number, number, number][];

export const SCENES = {
  /** every tower type at every look: level 1, level 4, both ultimates, overclocked */
  towers(C: GameCore) {
    C.newGame("easy");
    C.cheat("hesoyam");
    C.TKEYS.forEach((type, i) => {
      const x = 1 + i * 2;
      const ults = Object.keys(C.TT[type].ults);
      const rows: [number, number, string | null, number][] = [
        [2, 0, null, 0],
        [5, 3, null, 0],
        [9, 3, ults[0], 0],
        [12, 3, ults[1], 3],
      ];
      for (const [y, lvl, ult, oc] of rows) {
        const r = C.place(type, x, y);
        if (!r.ok) throw new Error(`place ${type} ${x},${y}: ${r.code}`);
        for (let l = 0; l < lvl; l++) C.upgrade(r.tower);
        if (ult) C.upgrade(r.tower, ult);
        for (let o = 0; o < oc; o++) C.upgrade(r.tower);
      }
    });
  },

  /** every tower type at all five levels, one row per level */
  levels(C: GameCore) {
    C.newGame("easy");
    C.cheat("hesoyam");
    C.TKEYS.forEach((type, i) => {
      for (let lvl = 0; lvl < 5; lvl++) {
        const r = C.place(type, 1 + i * 2, 1 + lvl * 3);
        if (!r.ok) throw new Error(`place ${type} lvl ${lvl}: ${r.code}`);
        for (let l = 0; l < Math.min(lvl, 3); l++) C.upgrade(r.tower);
        if (lvl === 4) C.upgrade(r.tower, Object.keys(C.TT[type].ults)[0]);
      }
    });
  },

  /** a level with a handful of towers on free cells and a wave on its way; the argument is the level id */
  levelTour(C: GameCore, id: string) {
    C.newGame("normal", id);
    C.cheat("hesoyam");
    const types: TowerType[] = ["gun", "cannon", "frost", "plasma", "laser", "missile"];
    let k = 0;
    for (let y = 2; y < C.H - 2 && k < types.length; y += 3)
      for (let x = 3; x < C.W - 3 && k < types.length; x += 5) if (C.placeCheck(x, y) === "") C.place(types[k++], x, y);
    C.sendWave();
  },

  /** a defended maze with a ground wave on its way */
  groundBattle(C: GameCore) {
    C.newGame("normal");
    C.cheat("hesoyam");
    const plan: Plan = [
      ["gun", 4, 5, 2],
      ["gun", 4, 9, 2],
      ["cannon", 7, 5, 2],
      ["frost", 7, 9, 1],
      ["plasma", 10, 5, 3],
      ["rail", 10, 9, 2],
      ["laser", 13, 5, 3],
      ["artillery", 13, 9, 1],
    ];
    for (const [type, x, y, lvl] of plan) {
      const r = C.place(type, x, y);
      if (r.ok) for (let l = 0; l < lvl; l++) C.upgrade(r.tower);
    }
    C.S.wave = 3; // wave 4: armoured
    C.sendWave();
  },

  /** flyers against missiles and lasers */
  airBattle(C: GameCore) {
    C.newGame("easy");
    C.cheat("hesoyam");
    for (const [type, x, y, lvl] of [
      ["missile", 5, 4, 3],
      ["missile", 5, 10, 3],
      ["laser", 9, 4, 2],
      ["gun", 9, 10, 2],
      ["missile", 14, 4, 1],
      ["frost", 14, 10, 1],
    ] as Plan) {
      const r = C.place(type, x, y);
      if (r.ok) for (let l = 0; l < lvl; l++) C.upgrade(r.tower);
    }
    C.S.wave = 4; // wave 5: flyers
    C.sendWave();
  },

  /** a boss wave on hard */
  bossBattle(C: GameCore) {
    C.newGame("hard");
    C.cheat("hesoyam");
    for (const [type, x, y, lvl] of [
      ["rail", 4, 4, 3],
      ["rail", 4, 10, 3],
      ["plasma", 8, 5, 3],
      ["plasma", 8, 9, 3],
      ["laser", 12, 4, 3],
      ["frost", 12, 10, 3],
    ] as Plan) {
      const r = C.place(type, x, y);
      if (r.ok) for (let l = 0; l < lvl; l++) C.upgrade(r.tower);
    }
    C.S.wave = 19; // wave 20: boss
    C.sendWave();
  },
};
