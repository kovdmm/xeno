// Player-facing names and descriptions of game data, by id. The simulation never reads these:
// it only needs the numbers in src/game/data. `*_en` fields are English; the plain ones are Russian.
export interface Text {
  name?: string;
  name_en?: string;
  desc?: string;
  desc_en?: string;
  short?: string;
  short_en?: string;
  label?: string;
  label_en?: string;
  ults?: Record<string, Text>;
}

export const GAME_TEXT: Record<"towers" | "enemies" | "difficulties" | "abilities" | "routes", Record<string, Text>> = {
  towers: {
    gun: {
      name: "Пулемёт",
      name_en: "Machine Gun",
      desc_en: "Cheap and fast-firing, hits everything. Weak against armor.",
      desc: "Дешёвый и скорострельный, бьёт по всем. Слаб против брони.",
      ults: {
        mini: {
          name: "Миниган",
          name_en: "Minigun",
          desc_en: "Fire rate ×6",
          desc: "Скорострельность ×6",
        },
        sniper: {
          name: "Снайпер",
          name_en: "Sniper",
          desc_en: "Range ×1.7, damage ×6, half the fire rate. Targets the toughest enemy",
          desc: "Радиус ×1.7, урон ×6, вдвое реже. Бьёт самого крепкого врага",
        },
      },
    },
    cannon: {
      name: "Пушка",
      name_en: "Cannon",
      desc_en: "Close-range splash shells. Ground targets only.",
      desc: "Снаряд по площади вблизи. Только наземные цели.",
      ults: {
        cluster: {
          name: "Кассета",
          name_en: "Cluster",
          desc_en: "Shell scatters 6 bomblets, damage ×2",
          desc: "Снаряд разбрасывает 6 суббоеприпасов, урон ×2",
        },
        shock: {
          name: "Сотрясение",
          name_en: "Concussion",
          desc_en: "Damage ×2.5, blast ×1.4, stuns for 0.5 s (then 2.5 s of stun immunity)",
          desc: "Урон ×2.5, взрыв ×1.4, оглушает на 0.5 с (после оглушения враг 2.5 с невосприимчив)",
        },
      },
    },
    frost: {
      name: "Крио",
      name_en: "Cryo",
      desc_en: "A pulse slows every enemy in range.",
      desc: "Импульс замедляет всех врагов в радиусе.",
      ults: {
        zero: {
          name: "Абсолютный ноль",
          name_en: "Absolute Zero",
          desc_en: "Every 3rd pulse freezes for 1.2 s (with immunity), 80% slow, range ×1.4",
          desc: "Каждый 3-й импульс замораживает на 1.2 с (с невосприимчивостью), замедление 80%, радиус ×1.4",
        },
        brittle: {
          name: "Хрупкость",
          name_en: "Brittle",
          desc_en: "Enemies in range take +60% damage from everything, range ×1.6",
          desc: "Враги в радиусе получают +60% урона от всего, радиус ×1.6",
        },
      },
    },
    missile: {
      name: "Ракеты",
      name_en: "Missiles",
      desc_en: "Homing missiles against flyers.",
      desc: "Самонаводящиеся ракеты против летунов.",
      ults: {
        swarm: {
          name: "Рой ракет",
          name_en: "Missile Swarm",
          desc_en: "Salvo at 8 different flyers",
          desc: "Залп по 8 разным летунам",
        },
        sam: {
          name: "Земля-воздух",
          name_en: "Surface-to-Air",
          desc_en: "Also hits ground units, splash damage",
          desc: "Бьёт и наземных, взрыв по площади",
        },
      },
    },
    laser: {
      name: "Лазер",
      name_en: "Laser",
      desc_en: "Continuous beam that pierces armor. Damage per second.",
      desc: "Непрерывный луч, пробивает броню. Урон в секунду.",
      ults: {
        prism: {
          name: "Призма",
          name_en: "Prism",
          desc_en: "4 beams at once",
          desc: "4 луча одновременно",
        },
        heat: {
          name: "Перегрев",
          name_en: "Overheat",
          desc_en: "Damage on one target ramps up to ×8 over 4 s, range ×1.3",
          desc: "Урон по одной цели растёт до ×8 за 4 с, радиус ×1.3",
        },
      },
    },
    plasma: {
      name: "Плазма",
      name_en: "Plasma",
      desc_en: "Plasma bolts set the target on fire. Burning pierces armor.",
      desc: "Сгустки поджигают цель. Горение пробивает броню.",
      ults: {
        nova: {
          name: "Сверхновая",
          name_en: "Supernova",
          desc_en: "The bolt explodes and ignites everything nearby, damage and burn ×2",
          desc: "Сгусток взрывается и поджигает всех рядом, урон и горение ×2",
        },
        plague: {
          name: "Чума",
          name_en: "Plague",
          desc_en: "Burn ×6 and it spreads to neighbors",
          desc: "Горение ×6 и перекидывается на соседей",
        },
      },
    },
    rail: {
      name: "Рельсотрон",
      name_en: "Railgun",
      desc_en: "An instant shot pierces every enemy in a line.",
      desc: "Мгновенный выстрел пробивает всех врагов на линии.",
      ults: {
        gauss: {
          name: "Гаусс",
          name_en: "Gauss",
          desc_en: "Damage ×2.5, triple-width beam, range ×1.2",
          desc: "Урон ×2.5, луч втрое шире, радиус ×1.2",
        },
        auto: {
          name: "Автомат",
          name_en: "Autoloader",
          desc_en: "Fire rate ×5",
          desc: "Скорострельность ×5",
        },
      },
    },
    artillery: {
      name: "Гаубица",
      name_en: "Howitzer",
      desc_en: "2×2 tower. Long-range fire at the toughest enemy, pierces armor.",
      desc: "Башня 2×2. Бьёт далеко по самому крепкому врагу, пробивает броню.",
      ults: {
        salvo: {
          name: "Залп",
          name_en: "Salvo",
          desc_en: "5 shells at different targets",
          desc: "5 снарядов по разным целям",
        },
        nuke: {
          name: "Ядерный снаряд",
          name_en: "Nuclear Shell",
          desc_en: "Damage ×7, blast radius 3.5, three times slower",
          desc: "Урон ×7, взрыв радиусом 3.5, втрое реже",
        },
      },
    },
  },
  enemies: {
    crawler: {
      name: "Ползуны",
      name_en: "Crawlers",
    },
    runner: {
      name: "Бегуны",
      name_en: "Runners",
    },
    swarm: {
      name: "Рой",
      name_en: "Swarm",
    },
    armored: {
      name: "Броненосцы",
      name_en: "Armored",
    },
    flyer: {
      name: "Летуны",
      name_en: "Flyers",
    },
    healer: {
      name: "Лекари",
      name_en: "Healers",
    },
    blinker: {
      name: "Прыгуны",
      name_en: "Blinkers",
    },
    boss: {
      name: "Матка",
      name_en: "Brood Mother",
    },
    queen: {
      name: "Королева роя",
      name_en: "Swarm Queen",
    },
  },
  difficulties: {
    easy: {
      name: "Лёгкий",
      name_en: "Easy",
      desc_en: "The original balance. No healers or blinkers.",
      desc: "Исходный баланс. Без лекарей и прыгунов.",
    },
    normal: {
      name: "Средний",
      name_en: "Normal",
      desc_en:
        "Enemy health up to ×1.9 by midgame, +1 armor. From wave 30: healers, blinkers and flyers mixed into ground waves.",
      desc: "Здоровье врагов до ×1.9 к середине игры, +1 броня. С 30-й волны лекари, прыгуны и летуны в наземных волнах.",
    },
    hard: {
      name: "Сложный",
      name_en: "Hard",
      desc_en: "Health up to ×2.5, armor +2 and grows faster, faster enemies, rewards −20%. New enemies from wave 20.",
      desc: "Здоровье до ×2.5, броня +2 и растёт быстрее, враги быстрее, награды −20%. Новые враги с 20-й волны.",
    },
    insane: {
      name: "Невозможный",
      name_en: "Impossible",
      desc_en:
        "Health up to ×3.4, armor +4 and grows faster, rewards −30%, 15 lives. Everything starts almost at once.",
      desc: "Здоровье до ×3.4, броня +4 и растёт быстрее, награды −30%, 15 жизней. Всё начинается почти сразу.",
    },
  },
  abilities: {
    stasis: {
      short: "Стазис",
      short_en: "Stasis",
      name_en: "Stasis",
      desc_en: "Every enemy is slowed by 75% for 8 s (Brood Mothers by 40%)",
      name: "Стазис",
      desc: "Все враги замедлены на 75% на 8 с (матки на 40%)",
    },
    meteor: {
      short: "Метеоры",
      short_en: "Meteors",
      name_en: "Meteors",
      desc_en: "15 meteors over the chosen area",
      name: "Метеоры",
      desc: "15 метеоров по выбранной области",
    },
    napalm: {
      short: "Напалм",
      short_en: "Napalm",
      name_en: "Napalm",
      desc_en: "A fire zone for 10 s, burning pierces armor",
      name: "Напалм",
      desc: "Огненная зона на 10 с, горение сквозь броню",
    },
    carpet: {
      short: "Бомбы",
      short_en: "Bombs",
      name_en: "Carpet Bombing",
      desc_en: "A bomber flies along the chosen row",
      name: "Бомбардировка",
      desc: "Бомбардировщик проходит по выбранному ряду",
    },
    nuke: {
      short: "Ядерка",
      short_en: "Nuke",
      name_en: "Nuclear Strike",
      desc_en: "After 1.5 s: 35% of health (Brood Mothers 10%) plus heavy damage to everything within radius 4",
      name: "Ядерный удар",
      desc: "Через 1.5 с: 35% здоровья (матки 10%) и большой урон всем в радиусе 4",
    },
  },
  routes: {
    h: {
      label: "слева → направо",
      label_en: "left → right",
    },
    v: {
      label: "сверху → вниз",
      label_en: "top → bottom",
    },
  },
};
