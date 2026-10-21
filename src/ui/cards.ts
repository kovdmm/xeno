// The text panels of the interface as pure functions: the same state in gives the same markup out.
// They know nothing of the DOM, so they are tested with a stand-in for the translator and the game.
import type { AbilityKey, Tower, TowerType } from "../game/types";
import { diffColor } from "./difficulty";
import { fmt } from "./format";
import type { Core } from "./types";
import type { UiState } from "./state";

export interface CardEnv {
  core: Core;
  t(key: string, vars?: Record<string, string | number>): string;
  /** the name/desc/... of a data entry in the current language (and orientation) */
  L(o: unknown, f?: string): string;
  /** how a route reads on the screen right now ("left → right"), whichever way the board is turned */
  routeLabel(route: string): string;
  /** colour of a tower level (and specialisation) */
  tierColor(level: number, type: TowerType, ult?: string): string;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** The card of a selected tower: stats now and after the next upgrade, the upgrade and sell buttons. */
export function towerCard(env: CardEnv, sel: Tower): string {
  const { core: C, t, L } = env,
    s = C.S,
    d = C.TT[sel.type],
    Lv = sel.lvl,
    cur = C.stats(sel);
  const nxs = Lv < 3 ? C.st(sel.type, Lv + 1) : Lv >= 4 ? C.st(sel.type, Lv, sel.ult, sel.oc + 1) : null;
  const row = (k: string, a: string | number, b?: string | number | null) =>
    `<span>${k}</span><span>${a}${b != null && nxs && b !== a ? ` <i>→ ${b}</i>` : ""}</span>`;
  const sx = " " + t("s");
  let rows =
    row(sel.type === "laser" ? t("dps") : t("dmg"), fmt(cur.dmg), nxs && fmt(nxs.dmg)) +
    row(t("range"), r2(cur.range), nxs && r2(nxs.range));
  if (cur.rate) rows += row(t("reload"), r2(cur.rate) + sx, nxs && r2(nxs.rate) + sx);
  if (cur.splash) rows += row(t("blast"), r2(cur.splash), nxs && r2(nxs.splash));
  if (cur.slow) rows += row(t("slow"), Math.round(cur.slow * 100) + "%", nxs && Math.round(nxs.slow * 100) + "%");
  if (cur.burn) rows += row(t("burn"), fmt(cur.burn), nxs && fmt(nxs.burn));
  if (cur.minR) rows += row(t("dead"), cur.minR);
  rows += `<span class="ext">${t("targets")}</span><span class="ext">${cur.air && cur.ground ? t("tBoth") : cur.air ? t("tAir") : t("tGround")}${cur.prio === "strong" ? t("tough") : ""}</span>`;
  rows += `<span class="ext">${t("armor")}</span><span class="ext">${cur.pierce ? t("pierces") : t("reduces")}</span>`;
  const uc = C.upCost(sel),
    poor = !s.freeTowers && s.credits < uc ? "disabled" : "";
  let up: string, lv: string;
  if (Lv < 3) {
    lv = t("lvl", { l: Lv + 1 });
    up = `<div class="btnrow"><button class="go" data-act="up" ${poor}>${t("upTo", { l: Lv + 2, c: fmt(uc) })}</button></div>`;
  } else if (Lv === 3) {
    lv = t("lvl", { l: 4 });
    up =
      `<div class="ultHead">${t("ultHead", { c: fmt(uc) })} · ${t("piercesArmor").toLowerCase()}</div><div class="ults">` +
      Object.entries(d.ults)
        .map(
          ([k, u]) =>
            `<button data-act="up" data-u="${k}" ${poor}><b>${L(u)}</b><small>${L(u, "desc")}</small></button>`,
        )
        .join("") +
      `</div>`;
  } else {
    const u = d.ults[sel.ult!];
    lv = t("lvl5") + (sel.oc ? t("oc", { n: sel.oc }) : "");
    up = `<div class="ultHead"><b>${L(u)}:</b> ${L(u, "desc")}</div><div class="btnrow"><button class="go" data-act="up" ${poor}>${t("ocBtn", { n: sel.oc + 1, c: fmt(uc) })}</button></div>`;
  }
  return `<div class="top"><div class="ttl">${L(d)} · <b style="color:${env.tierColor(Lv, sel.type, sel.ult)}">${lv}</b></div><button class="pedLink" data-act="pedia" data-t="${sel.type}" aria-label="${t("pediaOpen")}" title="${t("pediaOpen")}">i</button><button class="sellb" data-act="sell">${t("sell", { v: fmt(Math.floor(sel.inv * 0.7)) })}</button><button class="x" data-act="cancel" aria-label="${t("close")}">✕</button></div>
    ${up}<div class="kv">${rows}</div>`;
}

/** Desktop: what the card area says when no tower is selected: what is being built or aimed, or the command help. */
export function idleCard(env: CardEnv, st: Pick<UiState, "build" | "aim" | "diff">): string {
  const { core: C, t, L } = env;
  if (st.build) {
    const d = C.TT[st.build];
    return `<div class="top"><div class="ttl">${L(d)}</div><button class="pedLink" data-act="pedia" data-t="${st.build}" aria-label="${t("pediaOpen")}" title="${t("pediaOpen")}">i</button><button class="x" data-act="cancel" aria-label="${t("close")}">✕</button></div><p>${L(d, "desc")}</p>
      <div class="kv"><span>${st.build === "laser" ? t("dps") : t("dmg")}</span><span>${d.dmg[0]}</span><span>${t("range")}</span><span>${d.range[0]}</span>${d.size ? `<span>${t("size")}</span><span>${t("size22")}</span>` : ""}<span>${t("price")}</span><span>${d.cost[0]}</span></div>
      <p>${t("ultsList", {
        l: Object.values(d.ults)
          .map((u) => L(u))
          .join(" / "),
      })}</p><p class="hintp">${t("clickBuild")}</p>`;
  }
  if (st.aim) {
    const a = C.AB[st.aim];
    return `<div class="top"><div class="ttl">${L(a)}</div><button class="x" data-act="cancel" aria-label="${t("close")}">✕</button></div><p>${L(a, "desc")}.</p>
      <div class="kv"><span>${t("price")}</span><span>${fmt(C.abCost(st.aim))}</span><span>${t("cooldown")}</span><span>${a.cd} ${t("s")}</span></div><p class="hintp">${t("clickCast")}</p>`;
  }
  return `<div class="top"><div class="ttl">${t("cmdTtl")}</div></div><p>${t("cmdTxt", { d: `<b style="color:${diffColor(st.diff)}">${L(C.DIFF[st.diff])}</b>` })}</p>`;
}

/** The line about what comes next: the wave to expect, or what is being built or aimed. */
export function nextLine(env: CardEnv, st: Pick<UiState, "build" | "aim">): string {
  const { core: C, t, L } = env,
    s = C.S;
  if (st.build) {
    const d = C.TT[st.build];
    return `<span class="hint"><b>${L(d)}</b>${d.size ? " 2×2" : ""} · ${d.cost[0]} ${t("cr")}</span> ${L(d, "desc")} ${t("tap")}`;
  }
  if (st.aim) {
    const a = C.AB[st.aim as AbilityKey];
    return `<span class="hint"><b>${L(a)}</b> · ${fmt(C.abCost(st.aim))} ${t("cr")}</span> ${L(a, "desc")}. ${t("tap")}`;
  }
  if (s.wave >= C.FINAL) return t("finalWave");
  const w = C.makeWave(s.wave + 1),
    rl = w.route === "both" ? t("both") : env.routeLabel(w.route);
  const nm = w.type === "queen" ? L(C.ET.queen) : w.type === "boss" ? t("bossWave") : L(C.ET[w.type]);
  let nx = s.started
    ? t("nextWave", { n: s.wave + 1, nm, r: rl, t: Math.ceil(s.timer) })
    : t("firstWave", { nm, r: rl });
  if (w.list.some((e) => C.ET[e.type].fly)) nx += t("airHint");
  return nx;
}
