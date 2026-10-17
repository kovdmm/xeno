import type { TowerDef, TowerStats, TowerType } from "../types";

/* Towers. cost: build, up to 2, up to 3, up to 4. Level 5 (ultimate) costs 3x the level-4 upgrade.
   After level 5: endless overclock, damage x1.25 per level, cost x1.45 per level. */
export const TT: Record<TowerType, TowerDef> = {
  gun: {
    key: "1",
    cost: [15, 25, 45, 80],
    dmg: [7, 14, 26, 46],
    rate: [0.32, 0.27, 0.23, 0.2],
    range: [2.6, 2.9, 3.2, 3.5],
    air: 1,
    ground: 1,
    ults: {
      mini: {
        f: (s: TowerStats) => {
          s.rate /= 6;
        },
      },
      sniper: {
        f: (s: TowerStats) => {
          s.range *= 1.7;
          s.dmg *= 6;
          s.rate *= 2;
          s.prio = "strong";
        },
      },
    },
  },
  cannon: {
    key: "2",
    cost: [35, 50, 90, 150],
    dmg: [24, 50, 100, 180],
    rate: [1.3, 1.2, 1.1, 1],
    range: [2.8, 3.1, 3.4, 3.7],
    splash: [1, 1.15, 1.3, 1.45],
    air: 0,
    ground: 1,
    ults: {
      cluster: {
        f: (s: TowerStats) => {
          s.cluster = 6;
          s.dmg *= 2;
        },
      },
      shock: {
        f: (s: TowerStats) => {
          s.dmg *= 2.5;
          s.splash *= 1.4;
          s.stun = 0.5;
        },
      },
    },
  },
  frost: {
    key: "3",
    cost: [40, 55, 95, 160],
    dmg: [3, 7, 14, 26],
    rate: [1, 1, 1, 1],
    range: [2, 2.3, 2.6, 2.9],
    slow: [0.35, 0.5, 0.6, 0.68],
    air: 1,
    ground: 1,
    ults: {
      zero: {
        f: (s: TowerStats) => {
          s.freeze = 1.2;
          s.slow = 0.8;
          s.range *= 1.4;
        },
      },
      brittle: {
        f: (s: TowerStats) => {
          s.vuln = 0.6;
          s.range *= 1.6;
        },
      },
    },
  },
  missile: {
    key: "4",
    cost: [60, 75, 130, 220],
    dmg: [100, 220, 450, 800],
    rate: [1.6, 1.45, 1.3, 1.15],
    range: [4.2, 4.7, 5.2, 5.8],
    air: 1,
    ground: 0,
    ults: {
      swarm: {
        f: (s: TowerStats) => {
          s.multi = 8;
          s.dmg *= 0.8;
        },
      },
      sam: {
        f: (s: TowerStats) => {
          s.ground = 1;
          s.splash = 1.2;
        },
      },
    },
  },
  laser: {
    key: "5",
    cost: [90, 120, 200, 340],
    dmg: [70, 170, 380, 720],
    rate: [0, 0, 0, 0],
    range: [3.2, 3.6, 3.9, 4.2],
    air: 1,
    ground: 1,
    pierce: 1,
    ults: {
      prism: {
        f: (s: TowerStats) => {
          s.beams = 4;
        },
      },
      heat: {
        f: (s: TowerStats) => {
          s.heat = 4;
          s.range *= 1.3;
        },
      },
    },
  },
  plasma: {
    key: "6",
    cost: [70, 85, 150, 250],
    dmg: [30, 65, 140, 250],
    burn: [12, 28, 58, 110],
    rate: [0.8, 0.75, 0.7, 0.65],
    range: [3, 3.3, 3.6, 4],
    air: 1,
    ground: 1,
    ults: {
      nova: {
        f: (s: TowerStats) => {
          s.nova = 1.4;
          s.dmg *= 2;
          s.burn *= 2;
        },
      },
      plague: {
        f: (s: TowerStats) => {
          s.plague = 1;
          s.burn *= 6;
        },
      },
    },
  },
  rail: {
    key: "7",
    cost: [90, 120, 200, 340],
    dmg: [70, 150, 300, 520],
    rate: [2.6, 2.4, 2.2, 2],
    range: [4.5, 5, 5.5, 6],
    air: 1,
    ground: 1,
    pierce: 1,
    ults: {
      gauss: {
        f: (s: TowerStats) => {
          s.dmg *= 2.5;
          s.width = 3;
          s.range *= 1.2;
        },
      },
      auto: {
        f: (s: TowerStats) => {
          s.rate /= 5;
        },
      },
    },
  },
  artillery: {
    key: "8",
    size: 2,
    cost: [160, 200, 340, 560],
    dmg: [120, 260, 540, 1000],
    rate: [3.2, 3, 2.8, 2.6],
    range: [5.5, 6, 6.5, 7],
    minR: 1.2,
    splash: [1.3, 1.4, 1.5, 1.6],
    air: 0,
    ground: 1,
    pierce: 1,
    prio: "strong",
    ults: {
      salvo: {
        f: (s: TowerStats) => {
          s.multi = 5;
        },
      },
      nuke: {
        f: (s: TowerStats) => {
          s.dmg *= 7;
          s.splash = 3.5;
          s.rate *= 3;
        },
      },
    },
  },
};

export const TKEYS = Object.keys(TT) as TowerType[];
