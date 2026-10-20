// What a credit buys: single-target damage per second, range and the two kinds of reach of every tower at every
// level, with the money spent on it so far. Run with `yarn sim sim/towers.sim.ts`.
import { it } from "vitest";
import { BALANCE } from "../src/game/balance";
import { towerStats } from "../src/game/rules";
import type { TowerType } from "../src/game/types";

it("tower efficiency", () => {
  const rows: string[] = ["tower\tlvl\tspent\tdps\tdps/100cr\trange\tair\tground\tsplash"];
  for (const type of Object.keys(BALANCE.towers) as TowerType[]) {
    const d = BALANCE.towers[type];
    let spent = 0;
    for (let lvl = 0; lvl < 4; lvl++) {
      spent += d.cost[lvl];
      const s = towerStats(BALANCE, type, lvl);
      // a laser has no rate: its damage number is per second
      const dps = s.rate > 0 ? s.dmg / s.rate : s.dmg;
      rows.push(
        [
          type,
          lvl + 1,
          spent,
          dps.toFixed(0),
          ((dps / spent) * 100).toFixed(1),
          s.range,
          s.air,
          s.ground,
          s.splash || "",
        ].join("\t"),
      );
    }
  }
  process.stdout.write(rows.join("\n") + "\n");
});

it("ultimates (level 5): what the extra price buys", () => {
  const rows: string[] = ["tower\tult\tspent\tdps\tdps/100cr\trange\tnotes"];
  for (const type of Object.keys(BALANCE.towers) as TowerType[]) {
    const d = BALANCE.towers[type];
    const spent = d.cost.reduce((a, b) => a + b, 0) + d.cost[3] * BALANCE.economy.ultimateCostMultiplier;
    for (const ult of Object.keys(d.ults)) {
      const s = towerStats(BALANCE, type, 4, ult);
      const volley = Math.max(1, s.multi, s.beams);
      const dps = (s.rate > 0 ? s.dmg / s.rate : s.dmg) * volley;
      const notes = [
        s.splash && `splash ${s.splash}`,
        s.pierce && "pierce",
        volley > 1 && `x${volley}`,
        s.stun && "stun",
      ]
        .filter(Boolean)
        .join(" ");
      rows.push(
        [type, ult, spent, dps.toFixed(0), ((dps / spent) * 100).toFixed(1), s.range.toFixed(1), notes].join("\t"),
      );
    }
  }
  process.stdout.write("\n" + rows.join("\n") + "\n");
});
