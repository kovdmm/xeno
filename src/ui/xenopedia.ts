// The Xenopedia screen: the reference pages of src/xenopedia/model.ts drawn as four tabs (towers, ultimates, enemies,
// abilities). The numbers are the model's, i.e. the game's own; this file only lays them out. It opens from the title
// and from the card of a tower in the game.
import type { DiffKey } from "../game/types";
import type { LevelRow, Pedia, TowerPage } from "../xenopedia/model";
import type { UiContext } from "./context";
import { diffColor, skullIcon } from "./difficulty";
import { fmt } from "./format";

type Tab = "towers" | "ults" | "enemies" | "abilities";
const TABS: [Tab, string][] = [
  ["towers", "pediaTowers"],
  ["ults", "pediaUlt"],
  ["enemies", "pediaEnemies"],
  ["abilities", "pediaAbilities"],
];

/** Two decimals at most, no trailing zeros. */
const dec = (v: number) => String(Math.round(v * 100) / 100);

export function installXenopedia(ui: UiContext) {
  const { core: C, state: st, t, L, $, screens } = ui;
  let tab: Tab = "towers";
  let diff: DiffKey = st.diff;

  const tags = (...a: [boolean, string][]) =>
    `<p class="pedTags">${a
      .filter(([on]) => on)
      .map(([, s]) => `<span>${s}</span>`)
      .join("")}</p>`;
  const kv = (pairs: [string, string | number][]) =>
    `<div class="kv">${pairs.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join("")}</div>`;
  const targets = (p: TowerPage) => (p.air && p.ground ? t("tBoth") : p.air ? t("tAir") : t("tGround"));

  /** What a tower is at one shape, as label/value pairs (the beam of the laser has no reload: its damage is per second). */
  function statPairs(r: LevelRow, id: string): [string, string | number][] {
    const s = r.stats,
      out: [string, string | number][] = [
        [t("price"), fmt(r.cost)],
        [id === "laser" ? t("dps") : t("dmg"), fmt(s.dmg)],
      ];
    if (s.rate > 0) out.push([t("pediaDps"), fmt(r.dps)]);
    out.push([t("range"), dec(s.range)]);
    if (s.rate > 0) out.push([t("reload"), dec(s.rate) + " " + t("s")]);
    if (s.splash) out.push([t("blast"), dec(s.splash)]);
    if (s.slow) out.push([t("slow"), Math.round(s.slow * 100) + "%"]);
    if (s.burn) out.push([t("burn"), fmt(s.burn)]);
    return out;
  }

  /** Levels 1-4 as a table: a row for each number, a column for each level. */
  function levelsTable(p: TowerPage) {
    const cols = p.levels.map((r) => statPairs(r, p.id));
    // the rows every level has (a number a level does not have is not a row)
    const labels = cols.reduce<string[]>((a, c) => (c.length > a.length ? c.map(([k]) => k) : a), []);
    const head = `<tr><th>${t("pediaLevel", { n: "" }).trim()}</th>${p.levels.map((r) => `<th>${r.level}</th>`).join("")}</tr>`;
    const rows = labels
      .map(
        (k) => `<tr><th>${k}</th>${cols.map((c) => `<td>${c.find(([l]) => l === k)?.[1] ?? "–"}</td>`).join("")}</tr>`,
      )
      .join("");
    return `<table class="pedT"><thead>${head}</thead><tbody>${rows}</tbody></table>`;
  }

  const overclock = (p: TowerPage) =>
    `<p class="note">${t("pediaOverclock", { d: dec(p.overclock.damage), r: dec(p.overclock.range), c: fmt(p.overclock.firstCost), g: dec(p.overclock.costGrowth) })}</p>`;

  function towersTab(P: Pedia) {
    return P.towers
      .map(
        (p) =>
          `<section class="pedCard" data-tower="${p.id}"><h3>${p.name}</h3><p>${p.desc}</p>${tags([true, targets(p)], [p.size > 1, t("size22")])}${levelsTable(p)}${overclock(p)}</section>`,
      )
      .join("");
  }

  function ultsTab(P: Pedia) {
    return (
      `<p class="note">${t("pediaUltimates")}</p>` +
      P.towers
        .map(
          (p) =>
            `<section class="pedCard" data-tower="${p.id}"><h3>${p.name}</h3>${p.ultimates
              .map((u) => `<div class="pedUlt"><b>${u.name}</b><p>${u.desc}</p>${kv(statPairs(u.row, p.id))}</div>`)
              .join("")}</section>`,
        )
        .join("")
    );
  }

  /** The difficulty chips: the enemies and the prices depend on it. */
  const diffChips = () =>
    `<div class="rchips" role="group">${C.DKEYS.map(
      (k) =>
        `<button type="button" class="rchip" data-d="${k}" aria-pressed="${k === diff}" title="${L(C.DIFF[k])}" aria-label="${L(C.DIFF[k])}" style="--c:${diffColor(k)}">${skullIcon(k, 24)}</button>`,
    ).join("")}</div>`;

  function enemiesTab(P: Pedia) {
    return (
      diffChips() +
      `<p class="note">${t("pediaNote")}</p>` +
      P.enemies
        .map((e) => {
          const rows = e.rows
            .map(
              (r) =>
                `<tr><th>${t("pediaWaveN", { n: r.wave })}</th><td>${fmt(r.hp[diff])}</td><td>${r.armor[diff]}</td><td>${r.reward[diff]}</td></tr>`,
            )
            .join("");
          return `<section class="pedCard" data-enemy="${e.id}"><h3>${e.name}</h3>${tags([e.flying, t("pediaFlying")], [e.boss, t("pediaBoss")])}${kv(
            [
              [t("speed"), dec(e.speed[diff])],
              [t("pediaLives"), e.lives],
            ],
          )}<table class="pedT"><thead><tr><th></th><th>${t("pediaHp")}</th><th>${t("armor")}</th><th>${t("pediaReward")}</th></tr></thead><tbody>${rows}</tbody></table></section>`;
        })
        .join("")
    );
  }

  function abilitiesTab(P: Pedia) {
    return (
      diffChips() +
      P.abilities
        .map((a) => {
          const head = a.costs.map((c) => `<th>${c.wave}</th>`).join("");
          const row = a.costs.map((c) => `<td>${fmt(c.cost[diff])}</td>`).join("");
          return `<section class="pedCard" data-ability="${a.id}"><h3>${a.name}</h3><p>${a.desc}</p>${kv([[t("cooldown"), a.cooldown + " " + t("s")], ...(a.radius ? [[t("range"), dec(a.radius)] as [string, string]] : [])])}<table class="pedT"><thead><tr><th>${t("cWave")}</th>${head}</tr></thead><tbody><tr><th>${t("price")}</th>${row}</tr></tbody></table></section>`;
        })
        .join("")
    );
  }

  function render(focus?: string) {
    const P = C.pedia();
    $("pediaTabs").innerHTML = TABS.map(
      ([id, key]) =>
        `<button type="button" class="rchip" role="tab" data-tab="${id}" aria-selected="${id === tab}" aria-pressed="${id === tab}">${t(key)}</button>`,
    ).join("");
    $("pediaBody").innerHTML =
      tab === "towers"
        ? towersTab(P)
        : tab === "ults"
          ? ultsTab(P)
          : tab === "enemies"
            ? enemiesTab(P)
            : abilitiesTab(P);
    if (focus) $("pediaBody").querySelector(`[data-tower="${focus}"]`)?.scrollIntoView({ block: "start" });
  }

  /** Opens the screen; with a tower's id, on that tower's page. */
  function open(tower?: string) {
    diff = st.diff;
    if (tower) tab = "towers";
    render(tower);
    screens.show("pedia");
    if (!tower) $("pedia").scrollTop = 0;
  }

  $("pediaTabs").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-tab]");
    if (!b) return;
    tab = b.dataset.tab as Tab;
    render();
  });
  $("pediaBody").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-d]");
    if (!b) return;
    diff = b.dataset.d as DiffKey;
    render();
  });
  $("pediaClose").addEventListener("click", () => screens.hide("pedia"));
  $("pedia").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "pedia") screens.hide("pedia");
  });
  $("mPedia").addEventListener("click", () => open());

  return { open };
}

export type Xenopedia = ReturnType<typeof installXenopedia>;
