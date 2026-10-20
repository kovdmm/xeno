import { BALANCE } from "../src/game/balance";
import type { Balance } from "../src/game/types";

/** The balance with the changes of SIM_PATCH applied to a copy, e.g. SIM_PATCH='{"towers.gun.dmg":[5,10,19,34]}' (paths
 *  are dotted, array items are numbers). Lets a change be tried without editing balance.yaml. */
export function patched(): Balance {
  const b = structuredClone(BALANCE) as unknown as Record<string, any>;
  const patch = process.env.SIM_PATCH ? (JSON.parse(process.env.SIM_PATCH) as Record<string, unknown>) : {};
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split(".");
    let o = b;
    for (const k of keys.slice(0, -1)) {
      if (o[k] === undefined) throw new Error(`SIM_PATCH: no "${k}" in "${path}"`);
      o = o[k];
    }
    o[keys[keys.length - 1]] = value;
  }
  return b as unknown as Balance;
}
