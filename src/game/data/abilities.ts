import type { AbilityDef, AbilityKey } from "../types";

export const AB: Record<AbilityKey, AbilityDef> = {
  stasis: {
    key: "q",
    base: 150,
    per: 15,
    cd: 45,
    aim: 0,
  },
  meteor: {
    key: "w",
    base: 200,
    per: 20,
    cd: 40,
    aim: "circle",
    r: 3,
  },
  napalm: {
    key: "e",
    base: 180,
    per: 18,
    cd: 35,
    aim: "circle",
    r: 2.2,
  },
  carpet: {
    key: "r",
    base: 250,
    per: 25,
    cd: 50,
    aim: "row",
  },
  nuke: {
    key: "t",
    base: 600,
    per: 60,
    cd: 150,
    aim: "circle",
    r: 4,
  },
};

export const AKEYS = Object.keys(AB) as AbilityKey[];
