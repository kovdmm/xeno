/* Xeno-Tactic — game core.
   Pure game logic and state: no DOM, no canvas, no colors, no UI strings.
   The renderer and the UI read XT.core.S and the query helpers, issue commands,
   and listen to events emitted through XT.core.on(fn). */
(function (XT) {
  "use strict";
  const W = 22,
    H = 15,
    INF = 1e9,
    FINAL = 200;
  const DIRS = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const ROUTES = {
    h: {
      spawn: [
        [0, 6],
        [0, 7],
        [0, 8],
      ],
      exit: [
        [21, 6],
        [21, 7],
        [21, 8],
      ],
      dir: [1, 0],
      label: "слева → направо",
      label_en: "left → right",
    },
    v: {
      spawn: [
        [10, 0],
        [11, 0],
        [12, 0],
      ],
      exit: [
        [10, 14],
        [11, 14],
        [12, 14],
      ],
      dir: [0, 1],
      label: "сверху → вниз",
      label_en: "top → bottom",
    },
  };
  const RES = new Set();
  for (const r of Object.values(ROUTES)) for (const [x, y] of [...r.spawn, ...r.exit]) RES.add(y * W + x);

  /* ---------- towers ----------
   cost: build, up to 2, up to 3, up to 4. Level 5 (ultimate) costs 3x the level-4 upgrade.
   After level 5: endless overclock, damage x1.25 per level, cost x1.45 per level. */
  const TT = {
    gun: {
      name: "Пулемёт",
      name_en: "Machine Gun",
      desc_en: "Cheap and fast-firing, hits everything. Weak against armor.",
      key: "1",
      cost: [15, 25, 45, 80],
      dmg: [7, 14, 26, 46],
      rate: [0.32, 0.27, 0.23, 0.2],
      range: [2.6, 2.9, 3.2, 3.5],
      air: 1,
      ground: 1,
      desc: "Дешёвый и скорострельный, бьёт по всем. Слаб против брони.",
      ults: {
        mini: {
          name: "Миниган",
          name_en: "Minigun",
          desc_en: "Fire rate ×6",
          desc: "Скорострельность ×6",
          f: (s) => {
            s.rate /= 6;
          },
        },
        sniper: {
          name: "Снайпер",
          name_en: "Sniper",
          desc_en: "Range ×1.7, damage ×6, half the fire rate. Targets the toughest enemy",
          desc: "Радиус ×1.7, урон ×6, вдвое реже. Бьёт самого крепкого врага",
          f: (s) => {
            s.range *= 1.7;
            s.dmg *= 6;
            s.rate *= 2;
            s.prio = "strong";
          },
        },
      },
    },
    cannon: {
      name: "Пушка",
      name_en: "Cannon",
      desc_en: "Close-range splash shells. Ground targets only.",
      key: "2",
      cost: [35, 50, 90, 150],
      dmg: [24, 50, 100, 180],
      rate: [1.3, 1.2, 1.1, 1],
      range: [2.8, 3.1, 3.4, 3.7],
      splash: [1, 1.15, 1.3, 1.45],
      air: 0,
      ground: 1,
      desc: "Снаряд по площади вблизи. Только наземные цели.",
      ults: {
        cluster: {
          name: "Кассета",
          name_en: "Cluster",
          desc_en: "Shell scatters 6 bomblets, damage ×2",
          desc: "Снаряд разбрасывает 6 суббоеприпасов, урон ×2",
          f: (s) => {
            s.cluster = 6;
            s.dmg *= 2;
          },
        },
        shock: {
          name: "Сотрясение",
          name_en: "Concussion",
          desc_en: "Damage ×2.5, blast ×1.4, stuns for 0.5 s (then 2.5 s of stun immunity)",
          desc: "Урон ×2.5, взрыв ×1.4, оглушает на 0.5 с (после оглушения враг 2.5 с невосприимчив)",
          f: (s) => {
            s.dmg *= 2.5;
            s.splash *= 1.4;
            s.stun = 0.5;
          },
        },
      },
    },
    frost: {
      name: "Крио",
      name_en: "Cryo",
      desc_en: "A pulse slows every enemy in range.",
      key: "3",
      cost: [40, 55, 95, 160],
      dmg: [3, 7, 14, 26],
      rate: [1, 1, 1, 1],
      range: [2, 2.3, 2.6, 2.9],
      slow: [0.35, 0.5, 0.6, 0.68],
      air: 1,
      ground: 1,
      desc: "Импульс замедляет всех врагов в радиусе.",
      ults: {
        zero: {
          name: "Абсолютный ноль",
          name_en: "Absolute Zero",
          desc_en: "Every 3rd pulse freezes for 1.2 s (with immunity), 80% slow, range ×1.4",
          desc: "Каждый 3-й импульс замораживает на 1.2 с (с невосприимчивостью), замедление 80%, радиус ×1.4",
          f: (s) => {
            s.freeze = 1.2;
            s.slow = 0.8;
            s.range *= 1.4;
          },
        },
        brittle: {
          name: "Хрупкость",
          name_en: "Brittle",
          desc_en: "Enemies in range take +60% damage from everything, range ×1.6",
          desc: "Враги в радиусе получают +60% урона от всего, радиус ×1.6",
          f: (s) => {
            s.vuln = 0.6;
            s.range *= 1.6;
          },
        },
      },
    },
    missile: {
      name: "Ракеты",
      name_en: "Missiles",
      desc_en: "Homing missiles against flyers.",
      key: "4",
      cost: [60, 75, 130, 220],
      dmg: [100, 220, 450, 800],
      rate: [1.6, 1.45, 1.3, 1.15],
      range: [4.2, 4.7, 5.2, 5.8],
      air: 1,
      ground: 0,
      desc: "Самонаводящиеся ракеты против летунов.",
      ults: {
        swarm: {
          name: "Рой ракет",
          name_en: "Missile Swarm",
          desc_en: "Salvo at 8 different flyers",
          desc: "Залп по 8 разным летунам",
          f: (s) => {
            s.multi = 8;
            s.dmg *= 0.8;
          },
        },
        sam: {
          name: "Земля-воздух",
          name_en: "Surface-to-Air",
          desc_en: "Also hits ground units, splash damage",
          desc: "Бьёт и наземных, взрыв по площади",
          f: (s) => {
            s.ground = 1;
            s.splash = 1.2;
          },
        },
      },
    },
    laser: {
      name: "Лазер",
      name_en: "Laser",
      desc_en: "Continuous beam that pierces armor. Damage per second.",
      key: "5",
      cost: [90, 120, 200, 340],
      dmg: [70, 170, 380, 720],
      rate: [0, 0, 0, 0],
      range: [3.2, 3.6, 3.9, 4.2],
      air: 1,
      ground: 1,
      pierce: 1,
      desc: "Непрерывный луч, пробивает броню. Урон в секунду.",
      ults: {
        prism: {
          name: "Призма",
          name_en: "Prism",
          desc_en: "4 beams at once",
          desc: "4 луча одновременно",
          f: (s) => {
            s.beams = 4;
          },
        },
        heat: {
          name: "Перегрев",
          name_en: "Overheat",
          desc_en: "Damage on one target ramps up to ×8 over 4 s, range ×1.3",
          desc: "Урон по одной цели растёт до ×8 за 4 с, радиус ×1.3",
          f: (s) => {
            s.heat = 4;
            s.range *= 1.3;
          },
        },
      },
    },
    plasma: {
      name: "Плазма",
      name_en: "Plasma",
      desc_en: "Plasma bolts set the target on fire. Burning pierces armor.",
      key: "6",
      cost: [70, 85, 150, 250],
      dmg: [30, 65, 140, 250],
      burn: [12, 28, 58, 110],
      rate: [0.8, 0.75, 0.7, 0.65],
      range: [3, 3.3, 3.6, 4],
      air: 1,
      ground: 1,
      desc: "Сгустки поджигают цель. Горение пробивает броню.",
      ults: {
        nova: {
          name: "Сверхновая",
          name_en: "Supernova",
          desc_en: "The bolt explodes and ignites everything nearby, damage and burn ×2",
          desc: "Сгусток взрывается и поджигает всех рядом, урон и горение ×2",
          f: (s) => {
            s.nova = 1.4;
            s.dmg *= 2;
            s.burn *= 2;
          },
        },
        plague: {
          name: "Чума",
          name_en: "Plague",
          desc_en: "Burn ×6 and it spreads to neighbors",
          desc: "Горение ×6 и перекидывается на соседей",
          f: (s) => {
            s.plague = 1;
            s.burn *= 6;
          },
        },
      },
    },
    rail: {
      name: "Рельсотрон",
      name_en: "Railgun",
      desc_en: "An instant shot pierces every enemy in a line.",
      key: "7",
      cost: [90, 120, 200, 340],
      dmg: [70, 150, 300, 520],
      rate: [2.6, 2.4, 2.2, 2],
      range: [4.5, 5, 5.5, 6],
      air: 1,
      ground: 1,
      pierce: 1,
      desc: "Мгновенный выстрел пробивает всех врагов на линии.",
      ults: {
        gauss: {
          name: "Гаусс",
          name_en: "Gauss",
          desc_en: "Damage ×2.5, triple-width beam, range ×1.2",
          desc: "Урон ×2.5, луч втрое шире, радиус ×1.2",
          f: (s) => {
            s.dmg *= 2.5;
            s.width = 3;
            s.range *= 1.2;
          },
        },
        auto: {
          name: "Автомат",
          name_en: "Autoloader",
          desc_en: "Fire rate ×5",
          desc: "Скорострельность ×5",
          f: (s) => {
            s.rate /= 5;
          },
        },
      },
    },
    artillery: {
      name: "Гаубица",
      name_en: "Howitzer",
      desc_en: "2×2 tower. Long-range fire at the toughest enemy, pierces armor.",
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
      desc: "Башня 2×2. Бьёт далеко по самому крепкому врагу, пробивает броню.",
      ults: {
        salvo: {
          name: "Залп",
          name_en: "Salvo",
          desc_en: "5 shells at different targets",
          desc: "5 снарядов по разным целям",
          f: (s) => {
            s.multi = 5;
          },
        },
        nuke: {
          name: "Ядерный снаряд",
          name_en: "Nuclear Shell",
          desc_en: "Damage ×7, blast radius 3.5, three times slower",
          desc: "Урон ×7, взрыв радиусом 3.5, втрое реже",
          f: (s) => {
            s.dmg *= 7;
            s.splash = 3.5;
            s.rate *= 3;
          },
        },
      },
    },
  };
  const TKEYS = Object.keys(TT);
  function st(type, lvl, ult, oc) {
    const d = TT[type],
      L = Math.min(lvl, 3);
    const s = {
      dmg: d.dmg[L],
      rate: d.rate[L],
      range: d.range[L],
      splash: d.splash ? d.splash[L] : 0,
      slow: d.slow ? d.slow[L] : 0,
      burn: d.burn ? d.burn[L] : 0,
      minR: d.minR || 0,
      beams: 1,
      width: 1,
      pierce: !!d.pierce,
      air: d.air,
      ground: d.ground,
      prio: d.prio || "first",
      multi: 0,
    };
    if (lvl >= 4 && d.ults[ult]) {
      s.pierce = true;
      d.ults[ult].f(s);
    }
    if (oc) {
      const m = Math.pow(1.25, oc);
      s.dmg *= m;
      s.burn *= m;
    }
    return s;
  }
  const sT = (t) => st(t.type, t.lvl, t.ult, t.oc);
  function upCost(t) {
    const c = TT[t.type].cost;
    if (t.lvl < 3) return c[t.lvl + 1];
    if (t.lvl === 3) return c[3] * 3;
    return Math.round(c[3] * 1.5 * Math.pow(1.45, t.oc));
  }

  /* ---------- enemies & waves ---------- */
  const ET = {
    crawler: {
      name: "Ползуны",
      name_en: "Crawlers",
      hp: 32,
      spd: 1.5,
      rw: 2,
      armor: 0,
      r: 0.28,
      gap: 0.8,
    },
    runner: {
      name: "Бегуны",
      name_en: "Runners",
      hp: 22,
      spd: 2.7,
      rw: 2,
      armor: 0,
      r: 0.24,
      gap: 0.5,
    },
    swarm: {
      name: "Рой",
      name_en: "Swarm",
      hp: 13,
      spd: 2.0,
      rw: 1,
      armor: 0,
      r: 0.17,
      gap: 0.33,
    },
    armored: {
      name: "Броненосцы",
      name_en: "Armored",
      hp: 78,
      spd: 1.05,
      rw: 4,
      armor: 4,
      r: 0.33,
      gap: 1,
    },
    flyer: {
      name: "Летуны",
      name_en: "Flyers",
      hp: 30,
      spd: 1.55,
      rw: 3,
      armor: 0,
      r: 0.27,
      gap: 0.75,
      fly: 1,
    },
    healer: {
      name: "Лекари",
      name_en: "Healers",
      hp: 50,
      spd: 1.2,
      rw: 4,
      armor: 1,
      r: 0.3,
      gap: 1,
    },
    blinker: {
      name: "Прыгуны",
      name_en: "Blinkers",
      hp: 40,
      spd: 1.6,
      rw: 3,
      armor: 0,
      r: 0.25,
      gap: 0.7,
    },
    boss: {
      name: "Матка",
      name_en: "Brood Mother",
      hp: 720,
      spd: 0.82,
      rw: 60,
      armor: 6,
      r: 0.46,
      gap: 2.5,
      lives: 5,
      boss: 1,
    },
    queen: {
      name: "Королева роя",
      name_en: "Swarm Queen",
      hp: 720,
      spd: 0.5,
      rw: 5000,
      armor: 30,
      r: 0.62,
      gap: 3,
      lives: 20,
      boss: 1,
    },
  };
  const CYCLE = ["crawler", "runner", "swarm", "armored", "flyer", "crawler", "swarm", "runner", "armored"];
  const CYCLE2 = ["crawler", "runner", "swarm", "armored", "flyer", "healer", "swarm", "blinker", "armored"];
  /* Difficulty. Easy is the original balance. Harder levels ramp HP up through the midgame
   (waves ~8–60) so long mazes alone stop being enough, add armor, speed, mixed waves and
   two maze-countering enemies, and pay less. */
  const DIFF = {
    easy: {
      name: "Лёгкий",
      name_en: "Easy",
      desc_en: "The original balance. No healers or blinkers.",
      hp: 1,
      armor: 0,
      armorDiv: 8,
      spd: 1,
      rw: 1,
      credits: 110,
      lives: 20,
      ab: 1,
      gap: 22,
      mixFrom: 999,
      newFrom: 999,
      desc: "Исходный баланс. Без лекарей и прыгунов.",
    },
    normal: {
      name: "Средний",
      name_en: "Normal",
      desc_en:
        "Enemy health up to ×1.9 by midgame, +1 armor. From wave 30: healers, blinkers and flyers mixed into ground waves.",
      hp: 1.9,
      armor: 1,
      armorDiv: 8,
      spd: 1.05,
      rw: 0.9,
      credits: 100,
      lives: 20,
      ab: 1.2,
      gap: 20,
      mixFrom: 30,
      newFrom: 30,
      desc: "Здоровье врагов до ×1.9 к середине игры, +1 броня. С 30-й волны лекари, прыгуны и летуны в наземных волнах.",
    },
    hard: {
      name: "Сложный",
      name_en: "Hard",
      desc_en: "Health up to ×2.5, armor +2 and grows faster, faster enemies, rewards −20%. New enemies from wave 20.",
      hp: 2.5,
      armor: 2,
      armorDiv: 7,
      spd: 1.1,
      rw: 0.8,
      credits: 95,
      lives: 20,
      ab: 1.4,
      gap: 18,
      mixFrom: 18,
      newFrom: 20,
      desc: "Здоровье до ×2.5, броня +2 и растёт быстрее, враги быстрее, награды −20%. Новые враги с 20-й волны.",
    },
    insane: {
      name: "Невозможный",
      name_en: "Impossible",
      desc_en:
        "Health up to ×3.4, armor +4 and grows faster, rewards −30%, 15 lives. Everything starts almost at once.",
      hp: 3.4,
      armor: 4,
      armorDiv: 6,
      spd: 1.18,
      rw: 0.7,
      credits: 90,
      lives: 15,
      ab: 1.7,
      gap: 16,
      mixFrom: 10,
      newFrom: 12,
      desc: "Здоровье до ×3.4, броня +4 и растёт быстрее, награды −30%, 15 жизней. Всё начинается почти сразу.",
    },
  };
  const DKEYS = Object.keys(DIFF);
  let diff = "easy";
  const D = () => DIFF[diff];
  function ramp(n) {
    const t = Math.max(0, Math.min(1, (n - 8) / 52));
    return t * t * (3 - 2 * t);
  }
  const diffHP = (n) => 1 + (D().hp - 1) * ramp(n);
  // Quadratic growth, plus an exponential factor after wave 100 so the wall arrives near the end.
  function hpScale(n) {
    let m = 1 + 0.24 * (n - 1) + 0.02 * (n - 1) * (n - 1);
    if (n > 100) m *= Math.pow(1.013, n - 100);
    return m;
  }
  const unitHP = (n) => 32 * hpScale(Math.max(1, n)) * diffHP(Math.max(1, n));
  function makeWave(n) {
    const route = n <= 6 ? (n % 2 ? "h" : "v") : n % 4 === 0 || n % 10 === 0 ? "both" : n % 2 ? "h" : "v";
    const rt = (k) => (route === "both" ? (k % 2 ? "v" : "h") : route);
    const list = [];
    if (n === FINAL) {
      for (let k = 0; k < 24; k++) list.push({ type: "armored", route: rt(k), gap: 0.6, m: 3 });
      list.push({ type: "queen", route: "h", gap: 3, m: 14 });
      return { type: "queen", route: "both", list };
    }
    const cyc = n >= D().newFrom ? CYCLE2 : CYCLE;
    const type = n % 10 === 0 ? "boss" : cyc[(n - 1) % cyc.length];
    if (type === "boss") {
      for (let k = 0; k < 8; k++) list.push({ type: "crawler", route: rt(k), gap: 0.7, m: 1 });
      const b = n / 10,
        cnt = Math.min(b, 6),
        m = b / cnt;
      for (let k = 0; k < cnt; k++) list.push({ type: "boss", route: rt(k), gap: 2.5, m });
    } else {
      // Large waves are capped in count; the missing units are folded into HP and reward.
      const raw =
        {
          crawler: 10 + n / 2,
          runner: 10 + n / 2,
          swarm: 18 + n,
          armored: 6 + n / 3,
          flyer: 8 + n / 3,
          healer: 6 + n / 4,
          blinker: 10 + n / 3,
        }[type] | 0;
      // Flyers come in fewer, tougher units: each leak costs a life, so a partly failed air wave stays survivable.
      const cap = type === "swarm" ? 90 : type === "flyer" ? 30 : 60,
        cnt = Math.min(raw, cap),
        m = raw / cnt;
      for (let k = 0; k < cnt; k++) list.push({ type, route: rt(k), gap: ET[type].gap, m });
      // Mixed waves on harder levels: flyers ride along with ground waves, healers escort armor.
      if (n >= D().mixFrom && type !== "flyer") {
        const f = Math.max(2, Math.round(cnt * 0.2));
        for (let k = 0; k < f; k++)
          list.splice(Math.floor(((k + 0.5) * list.length) / f) + k, 0, {
            type: "flyer",
            route: rt(k),
            gap: 0.4,
            m: m * 0.8,
          });
      }
      if (n >= D().newFrom && type === "armored") {
        const hc = Math.max(2, Math.round(cnt * 0.15));
        for (let k = 0; k < hc; k++)
          list.splice(Math.floor(((k + 0.5) * list.length) / hc) + k, 0, {
            type: "healer",
            route: rt(k),
            gap: 0.6,
            m,
          });
      }
    }
    return { type, route, list };
  }
  function waveGap(n, list) {
    const spawnTime = list.reduce((a, e) => a + e.gap, 0);
    return Math.max(D().gap + 0.12 * n, spawnTime + 8);
  }

  /* ---------- abilities ---------- */
  const AB = {
    stasis: {
      short: "Стазис",
      short_en: "Stasis",
      name_en: "Stasis",
      desc_en: "Every enemy is slowed by 75% for 8 s (Brood Mothers by 40%)",
      name: "Стазис",
      key: "q",
      base: 150,
      per: 15,
      cd: 45,
      aim: 0,
      desc: "Все враги замедлены на 75% на 8 с (матки на 40%)",
    },
    meteor: {
      short: "Метеоры",
      short_en: "Meteors",
      name_en: "Meteors",
      desc_en: "15 meteors over the chosen area",
      name: "Метеоры",
      key: "w",
      base: 200,
      per: 20,
      cd: 40,
      aim: "circle",
      r: 3,
      desc: "15 метеоров по выбранной области",
    },
    napalm: {
      short: "Напалм",
      short_en: "Napalm",
      name_en: "Napalm",
      desc_en: "A fire zone for 10 s, burning pierces armor",
      name: "Напалм",
      key: "e",
      base: 180,
      per: 18,
      cd: 35,
      aim: "circle",
      r: 2.2,
      desc: "Огненная зона на 10 с, горение сквозь броню",
    },
    carpet: {
      short: "Бомбы",
      short_en: "Bombs",
      name_en: "Carpet Bombing",
      desc_en: "A bomber flies along the chosen row",
      name: "Бомбардировка",
      key: "r",
      base: 250,
      per: 25,
      cd: 50,
      aim: "row",
      desc: "Бомбардировщик проходит по выбранному ряду",
    },
    nuke: {
      short: "Ядерка",
      short_en: "Nuke",
      name_en: "Nuclear Strike",
      desc_en: "After 1.5 s: 35% of health (Brood Mothers 10%) plus heavy damage to everything within radius 4",
      name: "Ядерный удар",
      key: "t",
      base: 600,
      per: 60,
      cd: 150,
      aim: "circle",
      r: 4,
      desc: "Через 1.5 с: 35% здоровья (матки 10%) и большой урон всем в радиусе 4",
    },
  };
  const AKEYS = Object.keys(AB);
  const abCost = (k) => Math.round((AB[k].base + AB[k].per * Math.max(1, S.wave)) * D().ab);

  /* ---------- events ---------- */
  const listeners = [];
  const on = (fn) => {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  };
  const emit = (e) => {
    for (const fn of listeners) fn(e);
  };

  let S = null,
    nextId = 1;
  function newGame(difficulty) {
    if (DIFF[difficulty]) diff = difficulty;
    S = {
      diff,
      credits: D().credits,
      lives: D().lives,
      wave: 0,
      score: 0,
      started: false,
      over: false,
      won: false,
      t: 0,
      grid: new Array(W * H).fill(null),
      towers: [],
      creeps: [],
      proj: [],
      spawners: [],
      left: {},
      timer: 0,
      fields: {},
      cd: {},
      meteors: [],
      zones: [],
      bombers: [],
      nukes: [],
      stasisT: 0,
    };
    for (const k of AKEYS) S.cd[k] = 0;
    recompute();
    XT.core.S = S;
    emit({ type: "reset" });
    return S;
  }

  /* ---------- pathfinding ---------- */
  function bfs(r, blocked) {
    const d = new Int32Array(W * H).fill(INF),
      q = [];
    for (const [x, y] of ROUTES[r].exit) {
      const i = y * W + x;
      d[i] = 0;
      q.push(i);
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h],
        x = i % W,
        y = (i / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (d[j] !== INF || S.grid[j] || (blocked && blocked.includes(j))) continue;
        d[j] = d[i] + 1;
        q.push(j);
      }
    }
    return d;
  }
  function recompute() {
    S.fields.h = bfs("h", null);
    S.fields.v = bfs("v", null);
  }
  function pickNext(f, x, y, ldx, ldy) {
    let bx = -1,
      by = -1,
      bd = INF,
      same = false;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx,
        ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const v = f[ny * W + nx];
      if (v >= INF) continue;
      const s = dx === ldx && dy === ldy;
      if (v < bd || (v === bd && s && !same)) {
        bd = v;
        bx = nx;
        by = ny;
        same = s;
      }
    }
    return bx < 0 ? null : [bx, by];
  }
  // Cells the creeps of a route currently walk, from the middle entrance to the exit (for drawing).
  function routePath(r) {
    const f = S.fields[r],
      R = ROUTES[r];
    let [x, y] = R.spawn[1],
      ldx = R.dir[0],
      ldy = R.dir[1],
      g = 0;
    const p = [
      [x - R.dir[0], y - R.dir[1]],
      [x, y],
    ];
    while (f[y * W + x] > 0 && g++ < W * H) {
      const n = pickNext(f, x, y, ldx, ldy);
      if (!n) break;
      ldx = n[0] - x;
      ldy = n[1] - y;
      x = n[0];
      y = n[1];
      p.push([x, y]);
    }
    p.push([x + R.dir[0], y + R.dir[1]]);
    return p;
  }
  function footprint(x, y, sz) {
    const a = [];
    for (let dy = 0; dy < sz; dy++) for (let dx = 0; dx < sz; dx++) a.push([x + dx, y + dy]);
    return a;
  }
  /* Returns '' when a tower of size sz fits at (x,y); otherwise a reason code:
   out, busy (silent) · pcEdge, pc22, pcRes, pcEnemy, pcBlock, pcTrap (shown to the player). */
  function placeCheck(x, y, sz = 1) {
    const cells = footprint(x, y, sz);
    for (const [cx, cy] of cells) if (cx < 0 || cy < 0 || cx >= W || cy >= H) return sz > 1 ? "pcEdge" : "out";
    const idx = cells.map(([cx, cy]) => cy * W + cx);
    for (const i of idx) if (S.grid[i]) return sz > 1 ? "pc22" : "busy";
    for (const i of idx) if (RES.has(i)) return "pcRes";
    for (const c of S.creeps) {
      if (c.fly || c.dead) continue;
      for (const i of idx) {
        if (c.ti === i || (c.ci === i && Math.hypot(c.x - (i % W), c.y - ((i / W) | 0)) < 0.75)) return "pcEnemy";
      }
    }
    const f = { h: bfs("h", idx), v: bfs("v", idx) };
    for (const r of ["h", "v"]) for (const [sx, sy] of ROUTES[r].spawn) if (f[r][sy * W + sx] >= INF) return "pcBlock";
    for (const c of S.creeps) {
      if (c.fly || c.dead || c.ti < 0) continue;
      if (f[c.route][c.ti] >= INF) return "pcTrap";
    }
    return "";
  }
  // Top-left cell for a tower of this type centred on a point given in cell units.
  function buildOrigin(type, pt) {
    const z = TT[type].size || 1;
    return z === 1 ? [Math.floor(pt[0]), Math.floor(pt[1])] : [Math.round(pt[0] - z / 2), Math.round(pt[1] - z / 2)];
  }
  const towerAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? null : S.grid[y * W + x]);

  /* ---------- commands ---------- */
  function place(type, x, y) {
    const d = TT[type],
      z = d.size || 1;
    if (S.over) return { ok: false, code: "over" };
    if (S.credits < d.cost[0]) return { ok: false, code: "noCred" };
    const why = placeCheck(x, y, z);
    if (why) return { ok: false, code: why };
    const t = {
      id: nextId++,
      type,
      lvl: 0,
      oc: 0,
      gx: x,
      gy: y,
      size: z,
      x: x + (z - 1) / 2,
      y: y + (z - 1) / 2,
      cd: 0,
      ang: -Math.PI / 2,
      inv: d.cost[0],
      beam: null,
    };
    for (const [cx, cy] of footprint(x, y, z)) S.grid[cy * W + cx] = t;
    S.towers.push(t);
    S.credits -= d.cost[0];
    recompute();
    emit({ type: "built", tower: t });
    return { ok: true, tower: t };
  }
  function upgrade(t, u) {
    if (!t || S.over) return { ok: false, code: "over" };
    if (t.lvl === 3 && !TT[t.type].ults[u]) return { ok: false, code: "pickUlt" };
    const c = upCost(t);
    if (S.credits < c) return { ok: false, code: "noCred" };
    S.credits -= c;
    t.inv += c;
    if (t.lvl >= 4) {
      t.oc++;
      emit({ type: "upgraded", tower: t });
      return { ok: true, overclock: t.oc };
    }
    t.lvl++;
    if (t.lvl === 4) t.ult = u;
    emit({ type: "upgraded", tower: t });
    return { ok: true, ult: t.lvl === 4 ? u : null };
  }
  function sell(t) {
    if (!t) return 0;
    const v = Math.floor(t.inv * 0.7);
    S.credits += v;
    for (let i = 0; i < S.grid.length; i++) if (S.grid[i] === t) S.grid[i] = null;
    S.towers = S.towers.filter((x) => x !== t);
    recompute();
    emit({ type: "sold", tower: t });
    return v;
  }
  function sendWave(early) {
    if (S.wave >= FINAL || S.over) return;
    if (early && S.timer > 0) {
      const b = Math.floor(S.timer);
      if (b > 0) {
        S.credits += b;
        emit({ type: "toast", key: "early", vars: { b } });
      }
    }
    S.wave++;
    S.started = true;
    const w = makeWave(S.wave);
    S.spawners.push({ list: w.list.slice(), t: 0, wave: S.wave });
    S.left[S.wave] = w.list.length;
    S.timer = S.wave >= FINAL ? Infinity : waveGap(S.wave, w.list);
    emit({ type: "wave", n: S.wave });
    if (S.wave === FINAL) emit({ type: "toast", key: "finalToast" });
  }

  /* ---------- creeps ---------- */
  function spawn(e, n) {
    // Bosses take only the square root of the difficulty HP bonus, so boss waves stay beatable.
    // Flyers skip the maze and spend far less time under fire, so their HP grows slower:
    // about ×0.7 of ground growth at wave 10, ×0.5 at 50, ×0.26 at 250.
    const T = ET[e.type],
      R = ROUTES[e.route],
      dh = diffHP(n),
      hs = T.fly ? Math.pow(hpScale(n), 0.9) : hpScale(n);
    const m = hs * (T.boss ? Math.sqrt(dh) : dh) * (e.m || 1),
      Df = D();
    const c = {
      id: nextId++,
      type: e.type,
      route: e.route,
      wave: n,
      hp: T.hp * m,
      max: T.hp * m,
      spd: T.spd * Df.spd,
      boss: !!T.boss,
      armor: T.armor ? T.armor + Math.floor(n / Df.armorDiv) + Df.armor : 0,
      rw: Math.max(1, Math.round(T.rw * (1 + n * 0.04) * (e.m || 1) * Df.rw)),
      healT: Math.random(),
      blinkT: 2 + Math.random() * 2,
      r: T.r,
      fly: !!T.fly,
      slow: 0,
      slowT: 0,
      stunT: 0,
      burnT: 0,
      burn: 0,
      vulnT: 0,
      vuln: 0,
      dead: false,
      ox: 0,
      oy: 0,
      ang: Math.atan2(R.dir[1], R.dir[0]),
      dx: R.dir[0],
      dy: R.dir[1],
    };
    if (c.fly) {
      const s = R.spawn[1],
        ex = R.exit[1],
        off = (Math.random() - 0.5) * 2.4;
      c.x = s[0] - R.dir[0] * 1.5 + R.dir[1] * off;
      c.y = s[1] - R.dir[1] * 1.5 + R.dir[0] * off;
      c.gx = ex[0] + R.dir[0] * 1.5 + R.dir[1] * off;
      c.gy = ex[1] + R.dir[1] * 1.5 + R.dir[0] * off;
    } else {
      const s = R.spawn[(Math.random() * 3) | 0];
      c.x = s[0] - R.dir[0];
      c.y = s[1] - R.dir[1];
      c.tx = s[0];
      c.ty = s[1];
      c.ti = s[1] * W + s[0];
      c.ci = -1;
      c.leaving = false;
      c.ox = (Math.random() - 0.5) * 0.3;
      c.oy = (Math.random() - 0.5) * 0.3;
    }
    S.creeps.push(c);
  }
  function waveTick(n) {
    if (--S.left[n] === 0) {
      if (n === FINAL) {
        if (S.lives > 0) endGame(true);
        return;
      }
      const b = 4 + n;
      S.credits += b;
      emit({ type: "toast", key: "cleared", vars: { n, b } });
    }
  }
  function leak(c) {
    if (c.dead) return;
    c.dead = true;
    S.lives -= ET[c.type].lives || 1;
    emit({ type: "leak", creep: c });
    if (S.lives <= 0) {
      S.lives = 0;
      endGame(false);
      return;
    }
    waveTick(c.wave);
  }
  function kill(c) {
    if (c.dead) return;
    c.dead = true;
    S.credits += c.rw;
    S.score += c.rw * 10 + S.wave;
    emit({ type: "kill", creep: c, x: ex(c), y: ey(c) });
    waveTick(c.wave);
  }
  function endGame(won) {
    if (S.over) return;
    S.over = true;
    S.won = won;
    emit({ type: "end", won });
  }

  /* ---------- combat ---------- */
  const ex = (c) => c.x + c.ox,
    ey = (c) => c.y + c.oy;
  function ignite(c, burn, plague) {
    if (c.dead) return;
    c.burn = Math.max(c.burnT > 0 ? c.burn : 0, burn);
    c.burnT = 2;
    if (plague) c.plague = true;
  }
  function moveCreep(c, dt) {
    if (c.burnT > 0) {
      c.burnT -= dt;
      hit(c, c.burn * dt, true);
      if (c.dead) return;
      if (c.plague) {
        c.spreadT = (c.spreadT || 0) - dt;
        if (c.spreadT <= 0) {
          c.spreadT = 0.5;
          for (const e of S.creeps) {
            if (e === c || e.dead) continue;
            if (Math.hypot(ex(e) - ex(c), ey(e) - ey(c)) < 1.1 && (e.burnT <= 0 || e.burn < c.burn))
              ignite(e, c.burn, true);
          }
        }
      }
    } else c.plague = false;
    if (c.slowT > 0) c.slowT -= dt;
    if (c.vulnT > 0) c.vulnT -= dt;
    if (c.stunImm > 0) c.stunImm -= dt;
    if (c.stunT > 0) {
      c.stunT -= dt;
      return;
    }
    let sp = c.spd * (c.slowT > 0 ? 1 - c.slow : 1) * dt;
    if (c.fly) {
      const dx = c.gx - c.x,
        dy = c.gy - c.y,
        d = Math.hypot(dx, dy);
      if (d <= sp) {
        leak(c);
        return;
      }
      c.x += (dx / d) * sp;
      c.y += (dy / d) * sp;
      return;
    }
    if (c.type === "healer") {
      c.healT -= dt;
      if (c.healT <= 0) {
        c.healT = 0.5;
        // Healing does not stack: each creep takes at most one heal per half-second.
        for (const e of S.creeps) {
          if (e.dead || e.hp >= e.max || (e.healedAt || -1) > S.t - 0.49) continue;
          if (Math.hypot(ex(e) - ex(c), ey(e) - ey(c)) <= 1.6) {
            e.hp = Math.min(e.max, e.hp + e.max * (e === c ? 0.01 : 0.02));
            e.healedAt = S.t;
          }
        }
        emit({ type: "heal", x: ex(c), y: ey(c), r: 1.6 });
      }
    }
    if (c.type === "blinker" && !c.leaving) {
      c.blinkT -= dt;
      if (c.blinkT <= 0) {
        c.blinkT = 3.5;
        const x0 = ex(c),
          y0 = ey(c);
        travel(c, 4);
        if (c.dead) return;
        emit({ type: "blink", x: x0, y: y0, x2: ex(c), y2: ey(c) });
      }
    }
    travel(c, sp);
    const ta = Math.atan2(c.dy, c.dx);
    let da = ta - c.ang;
    while (da > Math.PI) da -= 6.283;
    while (da < -Math.PI) da += 6.283;
    c.ang += da * Math.min(1, dt * 12);
  }
  function travel(c, sp) {
    let guard = 0;
    while (sp > 0 && !c.dead && guard++ < 12) {
      const dx = c.tx - c.x,
        dy = c.ty - c.y,
        d = Math.hypot(dx, dy);
      if (d > sp) {
        c.x += (dx / d) * sp;
        c.y += (dy / d) * sp;
        break;
      }
      c.x = c.tx;
      c.y = c.ty;
      sp -= d;
      if (c.leaving) {
        leak(c);
        return;
      }
      const R = ROUTES[c.route],
        f = S.fields[c.route],
        i = c.ty * W + c.tx;
      if (f[i] === 0) {
        c.ci = i;
        c.ti = -1;
        c.tx += R.dir[0];
        c.ty += R.dir[1];
        c.dx = R.dir[0];
        c.dy = R.dir[1];
        c.leaving = true;
        continue;
      }
      const nx = pickNext(f, c.tx, c.ty, c.dx, c.dy);
      if (!nx) break;
      c.dx = nx[0] - c.tx;
      c.dy = nx[1] - c.ty;
      c.ci = i;
      c.tx = nx[0];
      c.ty = nx[1];
      c.ti = nx[1] * W + nx[0];
    }
  }
  function progress(c) {
    if (c.fly) return Math.hypot(c.gx - c.x, c.gy - c.y);
    if (c.ti < 0) return 0;
    return S.fields[c.route][c.ti] + Math.hypot(c.tx - c.x, c.ty - c.y);
  }
  const canHit = (s, c) => (c.fly ? s.air : s.ground);
  function inR(t, c, r) {
    const dx = ex(c) - t.x,
      dy = ey(c) - t.y;
    return dx * dx + dy * dy <= r * r;
  }
  function findTarget(t, s, skip) {
    let b = null,
      bp = INF;
    for (const c of S.creeps) {
      if (c.dead || !canHit(s, c) || !inR(t, c, s.range) || (skip && skip.includes(c))) continue;
      if (s.minR && inR(t, c, s.minR)) continue;
      const p = s.prio === "strong" ? -c.hp : progress(c);
      if (p < bp) {
        bp = p;
        b = c;
      }
    }
    return b;
  }
  function findTargets(t, s, n) {
    const a = [];
    while (a.length < n) {
      const c = findTarget(t, s, a);
      if (!c) break;
      a.push(c);
    }
    return a;
  }
  function hit(c, dmg, pierce) {
    if (c.dead) return;
    if (c.vulnT > 0) dmg *= 1 + c.vuln;
    if (!pierce) dmg = Math.max(dmg * 0.25, dmg - c.armor);
    c.hp -= dmg;
    if (c.hp <= 0) kill(c);
  }
  function areaHit(x, y, r, dmg, pierce, air, extra) {
    for (const c of S.creeps) {
      if (c.dead || (c.fly && !air)) continue;
      const q = Math.hypot(ex(c) - x, ey(c) - y);
      if (q > r + c.r * 0.5) continue;
      hit(c, dmg * (q < r * 0.4 ? 1 : 0.6), pierce);
      if (extra) extra(c);
    }
  }
  function stun(c, t) {
    if (c.stunImm > 0) return;
    const d = c.boss ? t * 0.25 : t;
    c.stunT = Math.max(c.stunT, d);
    c.stunImm = d + (c.boss ? 4 : 2.5);
  }
  function aimAt(t, c, dt) {
    const ta = Math.atan2(ey(c) - t.y, ex(c) - t.x);
    let da = ta - t.ang;
    while (da > Math.PI) da -= 6.283;
    while (da < -Math.PI) da += 6.283;
    t.ang += da * Math.min(1, dt * 14);
  }
  function updTower(t, dt) {
    const s = sT(t);
    t.cd -= dt;
    t.beam = null;
    if (t.type === "laser") {
      const prev = (t.tgts || []).filter((c) => !c.dead && inR(t, c, s.range)).slice(0, s.beams);
      while (prev.length < s.beams) {
        const c = findTarget(t, s, prev);
        if (!c) break;
        prev.push(c);
      }
      if (s.heat) {
        if (prev[0] && prev[0] === t.heatTgt) t.heatT += dt;
        else {
          t.heatT = 0;
          t.heatTgt = prev[0] || null;
        }
      }
      const mult = s.heat ? 1 + 7 * Math.min(1, t.heatT / s.heat) : 1;
      t.heatM = mult;
      t.tgts = prev;
      if (prev.length) {
        aimAt(t, prev[0], dt);
        t.beam = prev;
        for (const c of prev) hit(c, s.dmg * mult * dt, true);
      }
      return;
    }
    if (t.type === "frost") {
      if (t.cd > 0) return;
      let any = false;
      t.pulse = (t.pulse || 0) + 1;
      const freeze = s.freeze && t.pulse % 3 === 0;
      for (const c of S.creeps) {
        if (c.dead || !inR(t, c, s.range)) continue;
        any = true;
        c.slow = Math.max(c.slowT > 0 ? c.slow : 0, s.slow);
        c.slowT = 1.6;
        if (s.vuln) {
          c.vuln = Math.max(c.vulnT > 0 ? c.vuln : 0, s.vuln);
          c.vulnT = 2;
        }
        if (freeze) stun(c, s.freeze);
        hit(c, s.dmg, s.pierce);
      }
      if (any) {
        t.cd = Math.max(t.cd + s.rate, s.rate * 0.5);
        emit({ type: "pulse", tower: t, r: s.range, freeze });
      } else {
        t.cd = 0;
        t.pulse--;
      }
      return;
    }
    const c = findTarget(t, s);
    if (!c) {
      if (t.cd < 0) t.cd = 0;
      return;
    }
    aimAt(t, c, dt);
    if (t.cd > 0) return;
    const big = t.lvl >= 4;
    emit({ type: "shot", tower: t });
    for (let shot = 0; t.cd <= 0 && shot < 6; shot++) {
      t.cd += s.rate;
      const mx = t.x + Math.cos(t.ang) * 0.4,
        my = t.y + Math.sin(t.ang) * 0.4;
      if (t.type === "gun") {
        S.proj.push({
          k: "b",
          x: mx,
          y: my,
          tgt: c,
          dmg: s.dmg,
          spd: s.prio === "strong" ? 30 : 16,
          big,
          pierce: s.pierce,
        });
      } else if (t.type === "cannon") {
        S.proj.push({
          k: "s",
          src: "cannon",
          x: mx,
          y: my,
          tgt: c,
          tx: ex(c),
          ty: ey(c),
          dmg: s.dmg,
          sp: s.splash,
          spd: 9,
          big,
          pierce: s.pierce,
          cluster: s.cluster,
          stun: s.stun,
        });
      } else if (t.type === "missile") {
        const tg = s.multi ? findTargets(t, s, s.multi) : [c, c];
        tg.forEach((g, k) => {
          const side = k % 2 ? 1 : -1;
          S.proj.push({
            k: "m",
            x: t.x + Math.cos(t.ang + side * 1.2) * 0.25,
            y: t.y + Math.sin(t.ang + side * 1.2) * 0.25,
            tgt: g,
            dmg: s.multi ? s.dmg : s.dmg / 2,
            v: 2,
            ang: t.ang + side * (0.4 + k * 0.15),
            life: 6,
            pierce: s.pierce,
            air: s.air,
            ground: s.ground,
            sp: s.splash,
          });
        });
      } else if (t.type === "plasma") {
        S.proj.push({
          k: "pl",
          x: mx,
          y: my,
          tgt: c,
          dmg: s.dmg,
          burn: s.burn,
          spd: 7,
          big,
          pierce: s.pierce,
          nova: s.nova,
          plague: s.plague,
        });
      } else if (t.type === "rail") {
        const a = Math.atan2(ey(c) - t.y, ex(c) - t.x);
        t.ang = a;
        const x2 = t.x + Math.cos(a) * s.range,
          y2 = t.y + Math.sin(a) * s.range;
        for (const e of S.creeps) {
          if (e.dead) continue;
          const px = ex(e) - t.x,
            py = ey(e) - t.y,
            proj = px * Math.cos(a) + py * Math.sin(a);
          if (proj < 0 || proj > s.range) continue;
          if (Math.abs(-px * Math.sin(a) + py * Math.cos(a)) <= e.r + 0.15 * s.width) hit(e, s.dmg, true);
        }
        emit({
          type: "rail",
          tower: t,
          x: t.x,
          y: t.y,
          x2,
          y2,
          width: s.width,
          big,
        });
      } else if (t.type === "artillery") {
        const tg = s.multi ? findTargets(t, s, s.multi) : [c];
        const ox = t.x + Math.cos(t.ang) * 0.7,
          oy = t.y + Math.sin(t.ang) * 0.7;
        tg.forEach((g, k) => {
          S.proj.push({
            k: "a",
            x: ox,
            y: oy,
            sx: ox,
            sy: oy,
            tgt: g,
            tx: ex(g),
            ty: ey(g),
            f: -k * 0.12,
            dur: 1.1,
            h: 0,
            dmg: s.dmg,
            sp: s.splash,
            pierce: true,
            nuke: s.splash > 3,
          });
        });
        emit({ type: "muzzle", tower: t, x: ox, y: oy });
      }
    }
    if (t.cd < 0) t.cd = 0;
  }
  /* Explosion events carry a `kind` the renderer can style:
   shell, bomblet, missile, plasma, artillery, nukeShell, meteor, bomb, nuke. */
  function explode(p) {
    areaHit(p.tx, p.ty, p.sp, p.dmg, p.pierce, false, p.stun ? (c) => stun(c, p.stun) : null);
    emit({
      type: "explode",
      kind: p.src === "bomblet" ? "bomblet" : "shell",
      x: p.tx,
      y: p.ty,
      r: p.sp,
    });
    if (p.cluster)
      for (let k = 0; k < p.cluster; k++) {
        const a = Math.random() * 6.28,
          r = 0.6 + Math.random() * 1;
        S.proj.push({
          k: "s",
          src: "bomblet",
          x: p.tx,
          y: p.ty,
          tgt: null,
          tx: p.tx + Math.cos(a) * r,
          ty: p.ty + Math.sin(a) * r,
          dmg: p.dmg * 0.4,
          sp: 0.75,
          spd: 5,
          big: false,
          pierce: p.pierce,
        });
      }
  }
  function updProj(p, dt) {
    if (p.k === "b") {
      if (p.tgt.dead) {
        p.dead = true;
        return;
      }
      const dx = ex(p.tgt) - p.x,
        dy = ey(p.tgt) - p.y,
        d = Math.hypot(dx, dy),
        s = p.spd * dt;
      if (d <= s + 0.1) {
        hit(p.tgt, p.dmg, p.pierce);
        p.dead = true;
        return;
      }
      p.x += (dx / d) * s;
      p.y += (dy / d) * s;
    } else if (p.k === "s") {
      if (p.tgt && !p.tgt.dead) {
        p.tx = ex(p.tgt);
        p.ty = ey(p.tgt);
      }
      const dx = p.tx - p.x,
        dy = p.ty - p.y,
        d = Math.hypot(dx, dy),
        s = p.spd * dt;
      if (d <= s) {
        p.dead = true;
        explode(p);
        return;
      }
      p.x += (dx / d) * s;
      p.y += (dy / d) * s;
    } else if (p.k === "m") {
      p.life -= dt;
      if (p.life <= 0) {
        p.dead = true;
        return;
      }
      if (p.tgt.dead) {
        let b = null,
          bd = 100;
        for (const c of S.creeps) {
          if (c.dead || !(c.fly ? p.air : p.ground)) continue;
          const q = (ex(c) - p.x) ** 2 + (ey(c) - p.y) ** 2;
          if (q < bd) {
            bd = q;
            b = c;
          }
        }
        if (!b) {
          p.dead = true;
          return;
        }
        p.tgt = b;
      }
      const dx = ex(p.tgt) - p.x,
        dy = ey(p.tgt) - p.y,
        d = Math.hypot(dx, dy);
      let da = Math.atan2(dy, dx) - p.ang;
      while (da > Math.PI) da -= 6.283;
      while (da < -Math.PI) da += 6.283;
      p.ang += da * Math.min(1, dt * 7);
      p.v = Math.min(10, p.v + dt * 12);
      const s = p.v * dt;
      if (d <= s + 0.15) {
        if (p.sp) areaHit(p.x, p.y, p.sp, p.dmg, p.pierce, true);
        else hit(p.tgt, p.dmg, p.pierce);
        p.dead = true;
        emit({
          type: "explode",
          kind: "missile",
          x: p.x,
          y: p.y,
          r: p.sp || 0.35,
        });
        return;
      }
      p.x += Math.cos(p.ang) * s;
      p.y += Math.sin(p.ang) * s;
    } else if (p.k === "pl") {
      if (p.tgt.dead) {
        p.dead = true;
        return;
      }
      const dx = ex(p.tgt) - p.x,
        dy = ey(p.tgt) - p.y,
        d = Math.hypot(dx, dy),
        s = p.spd * dt;
      if (d <= s + 0.12) {
        const c = p.tgt;
        hit(c, p.dmg, p.pierce);
        ignite(c, p.burn, p.plague);
        if (p.nova) areaHit(p.x, p.y, p.nova, p.dmg * 0.6, p.pierce, true, (e) => ignite(e, p.burn, false));
        emit({
          type: "explode",
          kind: "plasma",
          x: p.x,
          y: p.y,
          r: p.nova || 0.3,
        });
        p.dead = true;
        return;
      }
      p.x += (dx / d) * s;
      p.y += (dy / d) * s;
    } else if (p.k === "a") {
      if (p.tgt && !p.tgt.dead) {
        p.tx = ex(p.tgt);
        p.ty = ey(p.tgt);
      }
      p.f += dt / p.dur;
      const f = Math.max(0, Math.min(1, p.f));
      p.x = p.sx + (p.tx - p.sx) * f;
      p.y = p.sy + (p.ty - p.sy) * f;
      p.h = Math.sin(Math.PI * f) * 1.8;
      if (p.f >= 1) {
        p.dead = true;
        areaHit(p.tx, p.ty, p.sp, p.dmg, true, false);
        emit({
          type: "explode",
          kind: p.nuke ? "nukeShell" : "artillery",
          x: p.tx,
          y: p.ty,
          r: p.sp,
        });
      }
    }
  }

  /* ---------- abilities runtime ---------- */
  /* Returns {ok:true} or {ok:false, code:'cd'|'noCred'|'over', s:secondsLeft}. */
  function cast(k, pt) {
    const A = AB[k],
      cost = abCost(k);
    if (S.over) return { ok: false, code: "over" };
    if (S.cd[k] > 0) return { ok: false, code: "cd", s: Math.ceil(S.cd[k]) };
    if (S.credits < cost) return { ok: false, code: "noCred" };
    S.credits -= cost;
    S.cd[k] = A.cd;
    const U = unitHP(S.wave);
    // pt is in board units (cell edges); game positions use cell centres.
    if (pt) pt = [pt[0] - 0.5, pt[1] - 0.5];
    if (k === "stasis") {
      for (const c of S.creeps) {
        if (c.dead) continue;
        c.slow = Math.max(c.slowT > 0 ? c.slow : 0, c.boss ? 0.4 : 0.75);
        c.slowT = 8;
      }
      S.stasisT = 8;
    } else if (k === "meteor") {
      for (let i = 0; i < 15; i++) {
        const a = Math.random() * 6.28,
          r = Math.sqrt(Math.random()) * A.r;
        S.meteors.push({
          kind: "meteor",
          x: pt[0] + Math.cos(a) * r,
          y: pt[1] + Math.sin(a) * r,
          t: i * 0.17,
          fall: 0.6,
          dmg: 1.5 * U,
          r: 1,
        });
      }
    } else if (k === "napalm") {
      S.zones.push({
        x: pt[0],
        y: pt[1],
        r: A.r,
        t: 10,
        max: 10,
        dps: 0.6 * U,
      });
    } else if (k === "carpet") {
      S.bombers.push({ x: -1.5, y: Math.round(pt[1]), next: 0, dmg: 1.3 * U });
    } else if (k === "nuke") {
      S.nukes.push({ x: pt[0], y: pt[1], t: 1.5, r: A.r, dmg: 8 * U });
    }
    emit({ type: "cast", ability: k, pt });
    return { ok: true };
  }
  function stepAbilities(dt) {
    for (const k of AKEYS) if (S.cd[k] > 0) S.cd[k] = Math.max(0, S.cd[k] - dt);
    if (S.stasisT > 0) S.stasisT -= dt;
    for (const m of S.meteors) {
      m.t -= dt;
      if (m.t <= -m.fall && !m.done) {
        m.done = true;
        areaHit(m.x, m.y, m.r, m.dmg, true, true);
        emit({ type: "explode", kind: m.kind, x: m.x, y: m.y, r: m.r });
      }
    }
    S.meteors = S.meteors.filter((m) => !m.done);
    for (const z of S.zones) {
      z.t -= dt;
      for (const c of S.creeps) {
        if (c.dead || c.fly) continue;
        if (Math.hypot(ex(c) - z.x, ey(c) - z.y) <= z.r) hit(c, z.dps * dt, true);
      }
    }
    S.zones = S.zones.filter((z) => z.t > 0);
    for (const b of S.bombers) {
      b.x += 8 * dt;
      while (b.next <= b.x && b.next <= W) {
        S.meteors.push({
          kind: "bomb",
          x: b.next,
          y: b.y + (Math.random() - 0.5) * 1.2,
          t: 0,
          fall: 0.35,
          dmg: b.dmg,
          r: 1.1,
        });
        b.next += 0.6;
      }
    }
    S.bombers = S.bombers.filter((b) => b.x < W + 2);
    for (const n of S.nukes) {
      n.t -= dt;
      if (n.t <= 0 && !n.done) {
        n.done = true;
        for (const c of S.creeps) {
          if (c.dead) continue;
          if (Math.hypot(ex(c) - n.x, ey(c) - n.y) <= n.r + c.r) hit(c, c.max * (c.boss ? 0.1 : 0.35) + n.dmg, true);
        }
        emit({ type: "explode", kind: "nuke", x: n.x, y: n.y, r: n.r });
      }
    }
    S.nukes = S.nukes.filter((n) => !n.done);
  }

  /* ---------- cheats ---------- */
  // Returns the applied effect or null for an unknown code. A cheated game is flagged (no records).
  function cheat(code) {
    code = String(code || "")
      .trim()
      .toLowerCase();
    if (code === "hesoyam") {
      S.lives = Math.max(S.lives, 100);
      S.credits += 250000;
      S.cheated = true;
      emit({ type: "cheat", code });
      return { lives: S.lives, credits: 250000 };
    }
    return null;
  }

  /* ---------- tick ---------- */
  function step(dt) {
    S.t += dt;
    if (S.started && !S.over) {
      S.timer -= dt;
      if (S.timer <= 0) sendWave(false);
      for (const s of S.spawners) {
        s.t -= dt;
        while (s.t <= 0 && s.list.length) {
          const e = s.list.shift();
          spawn(e, s.wave);
          s.t += e.gap;
        }
      }
      S.spawners = S.spawners.filter((s) => s.list.length);
    }
    for (const c of S.creeps) if (!c.dead) moveCreep(c, dt);
    if (S.over) return;
    stepAbilities(dt);
    for (const t of S.towers) updTower(t, dt);
    for (const p of S.proj) updProj(p, dt);
    S.proj = S.proj.filter((p) => !p.dead);
    S.creeps = S.creeps.filter((c) => !c.dead);
  }

  XT.core = {
    W,
    H,
    FINAL,
    ROUTES,
    TT,
    TKEYS,
    ET,
    DIFF,
    DKEYS,
    AB,
    AKEYS,
    S: null,
    on,
    newGame,
    step,
    // commands
    place,
    upgrade,
    sell,
    sendWave,
    cast,
    cheat,
    // queries (read-only)
    stats: sT,
    st,
    upCost,
    abCost,
    makeWave,
    placeCheck,
    buildOrigin,
    towerAt,
    routePath,
    unitHP,
    pos: (c) => [ex(c), ey(c)],
    difficulty: () => diff,
  };
})((window.XT = window.XT || {}));
