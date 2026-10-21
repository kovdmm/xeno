// The highscore table in the interface: a server seed for the next game (so a finished game can be entered), the
// "save to the table" box on the end screen, the question when a finished game is left unsaved, and the records
// screen. The game never waits for any of it: without a connection a game starts from a local seed and is simply not
// enterable.
//
// The name is asked once: the first time a finished game is offered, in the box on the end screen (or in the question).
// After that it is used without asking, and changed in the settings.
import { nickKey, sanitizeNick } from "../nick";
import { better, type Result } from "../ranking";
import type { ScoreRow, ScoresClient, SeedGrant, SubmitResult } from "../scores";
import type { UiContext } from "./context";
import { skullIcon } from "./difficulty";
import { mapThumb } from "./mapThumb";
import { NICK_MAX, readNick, writeNick } from "./nickStore";

/** the results this browser has had entered, per name, map and difficulty: a game that cannot beat them is not offered */
const BEST_KEY = "xt-saved-best";
/** a seed is asked for again when the one in hand has less than this left (the server's tokens last six hours) */
const MIN_LIFE = 3600_000;

interface Hand extends SeedGrant {
  level: string;
  diff: string;
}

export function createRecords(
  ui: UiContext,
  client: ScoresClient,
  deps: {
    /** a seed arrived while the game is still untouched: the session may start it over on that seed */
    onSeed(): void;
    now?: () => number;
  },
) {
  const { core: C, state: st, t, L, $, screens, store } = ui;
  const now = deps.now ?? Date.now;

  let spare: Hand | null = null;
  let asking = false;
  /** the grant the game being played started from, and so the only one its run can be entered with */
  let playing: { token: string; seed: number; level: string; diff: string } | null = null;

  /** asks the server for a seed for the next game on this map and difficulty, unless one is in hand */
  async function prefetch(level: string = st.level, diff: string = st.diff): Promise<void> {
    if (asking) return;
    if (spare && spare.level === level && spare.diff === diff && spare.expires - now() > MIN_LIFE) return;
    asking = true;
    let arrived = false;
    try {
      const g = await client.seed(level, diff);
      if (g) {
        spare = { ...g, level, diff };
        arrived = true;
      }
    } finally {
      asking = false;
    }
    // the game in hand started without a seed (the server was not reached in time): it may take this one. After
    // `asking` is cleared, so that taking it can ask for the next seed at once.
    if (arrived && !playing) deps.onSeed();
  }

  /** The seed for a new game on this map and difficulty, if the server has given one; asks for the next one. */
  function takeSeed(level: string, diff: string): number | undefined {
    const g = spare;
    spare = null;
    playing = null;
    offer = null;
    void prefetch(level, diff);
    if (g && g.level === level && g.diff === diff && g.expires - now() > 60_000) {
      playing = { token: g.token, seed: g.seed, level, diff };
      return g.seed;
    }
    return undefined;
  }

  // ---- what this browser has entered ----------------------------------------------------------------------------

  const bestKey = (nick: string, level: string, diff: string) => `${nickKey(nick)}|${level}|${diff}`;
  function savedBests(): Record<string, Result> {
    try {
      const o = JSON.parse(store.get(BEST_KEY) ?? "{}");
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  }
  const savedBest = (nick: string, level: string, diff: string): Result | undefined =>
    savedBests()[bestKey(nick, level, diff)];
  function rememberBest(nick: string, level: string, diff: string, r: Result) {
    const all = savedBests();
    const k = bestKey(nick, level, diff);
    if (!all[k] || better(r, all[k])) all[k] = r;
    store.set(BEST_KEY, JSON.stringify(all));
  }

  // ---- the end screen --------------------------------------------------------------------------------------------

  /** the finished game that can be entered and has not been yet: what the box, the question and the save work on */
  let offer: { level: string; diff: string; result: Result } | null = null;
  let saved = false;
  /** the player said "don't save" to the question: it is asked once per game */
  let declined = false;

  const input = (id: string) => $(id) as HTMLInputElement;
  const button = (id: string) => $(id) as HTMLButtonElement;

  /** Shows the save box when the game that just ended can be entered, and would not only repeat a better result. */
  function onEnd() {
    const run = C.run();
    const ok =
      !!run && !!playing && run.seed === playing.seed && run.level === playing.level && run.diff === playing.diff;
    saved = false;
    declined = false;
    offer = null;
    // the tutorial's game is a lesson, not a record: the box does not appear and nothing is asked on leaving
    if (ui.inTutorial?.()) {
      $("saveBox").hidden = true;
      return;
    }
    $("saveBox").hidden = !ok;
    if (!ok) return;
    const result = C.outcome();
    const nick = readNick(store);
    const prev = nick ? savedBest(nick, run.level, run.diff) : undefined;
    $("saveNickLbl").hidden = !!nick;
    button("saveBtn").hidden = true;
    if (prev && !better(result, prev)) {
      // only the best result of a player is entered: this one would change nothing, so it is not sent
      $("saveMsg").textContent = t("saveNotBetter", { d: ui.where(run.level, run.diff) });
      return;
    }
    offer = { level: run.level, diff: run.diff, result };
    input("saveNick").value = "";
    button("saveBtn").disabled = false;
    button("saveBtn").hidden = false;
    $("saveMsg").textContent = nick ? t("saveAs", { n: nick }) : "";
  }

  const WHY: Record<Exclude<SubmitResult["status"], "saved">, string> = {
    rejected: "saveRejected",
    outdated: "saveOutdated",
    busy: "saveBusy",
    rate: "saveRate",
    expired: "saveExpired",
    offline: "saveOffline",
  };
  /** a used or too old token, or a game the server does not accept, cannot be tried again; the rest can */
  const final = (r: SubmitResult) => r.status === "rejected" || r.status === "outdated" || r.status === "expired";

  /** Sends the finished game under the name in hand (or the one typed). The table is read again when it is on screen. */
  async function send(typed: string): Promise<SubmitResult | null> {
    const run = C.run();
    if (!run || !playing || !offer || saved) return null;
    const nick = sanitizeNick(readNick(store) || typed);
    const r = await client.submit(run, nick, playing.token);
    if (r.status === "saved") {
      saved = true;
      writeNick(store, nick);
      rememberBest(nick, offer.level, offer.diff, offer.result);
      if (screens.isOpen("records")) void load(); // the place must be seen at once, not after the next visit
    }
    return r;
  }
  const said = (r: SubmitResult) =>
    r.status === "saved"
      ? t(r.improved ? "saveOk" : "saveOkWorse", { n: r.rank, d: ui.where(offer?.level, offer?.diff) })
      : t(WHY[r.status]);

  async function save() {
    if (!offer || saved) return;
    button("saveBtn").disabled = true;
    $("saveMsg").textContent = t("saveSending");
    const r = await send(input("saveNick").value);
    if (!r) return;
    $("saveMsg").textContent = said(r);
    if (r.status === "saved") {
      button("saveBtn").hidden = true;
      $("saveNickLbl").hidden = true;
    } else button("saveBtn").disabled = final(r);
  }

  // ---- leaving a finished game that was not entered ---------------------------------------------------------------

  let leaving: (() => void) | null = null;

  /**
   * Asks "save to the records table?" when a finished game that could be entered is being left (a new game, the menu,
   * another map). Once per game. Returns true when it has taken over: `next` runs after the answer. Escape or a tap
   * beside the question cancels the leaving: `next` does not run.
   */
  function ask(next: () => void): boolean {
    if (!offer || saved || declined) return false;
    leaving = next;
    const nick = readNick(store);
    $("askNickLbl").hidden = !!nick;
    input("askNick").value = "";
    $("askMsg").textContent = nick ? t("saveAs", { n: nick }) : "";
    button("askYes").disabled = false;
    screens.show("saveAsk");
    return true;
  }
  function proceed() {
    screens.hide("saveAsk");
    const next = leaving;
    leaving = null;
    next?.();
  }
  async function askYes() {
    button("askYes").disabled = true;
    $("askMsg").textContent = t("saveSending");
    const r = await send(input("askNick").value);
    if (!r) return proceed();
    if (r.status === "saved") {
      $("saveMsg").textContent = said(r);
      button("saveBtn").hidden = true;
      return proceed();
    }
    $("askMsg").textContent = said(r);
    button("askYes").disabled = final(r); // the others may be tried again, or the game left with "don't save"
  }

  // ---- the records screen ----------------------------------------------------------------------------------------

  let loadId = 0;
  /** the filters: null is "all" */
  let fLevel: string | null = null;
  let fDiff: string | null = null;

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const anyOpen = () => fLevel === null || fDiff === null;

  /** The buttons that choose the map and the difficulty: pictures, as everywhere else (the names are the labels). */
  function renderFilters() {
    const chip = (f: "level" | "diff", v: string, label: string, inner: string, cls = "") =>
      `<button type="button" class="rchip${cls}" data-f="${f}" data-v="${v}" title="${label}" aria-label="${label}">${inner}</button>`;
    $("recLevels").innerHTML =
      chip("level", "", t("recAllMaps"), t("recAll"), " all") +
      C.LKEYS.map((id) => chip("level", id, L(C.LEVELS[id]), mapThumb(C.LEVELS[id]))).join("");
    $("recDiffs").innerHTML =
      chip("diff", "", t("recAllDiffs"), t("recAll"), " all") +
      C.DKEYS.map((k) => chip("diff", k, L(C.DIFF[k]), skullIcon(k, 24))).join("");
    markFilters();
  }
  function markFilters() {
    for (const b of $("recFilters").querySelectorAll<HTMLButtonElement>("[data-f]")) {
      const on = b.dataset.f === "level" ? fLevel : fDiff;
      b.setAttribute("aria-pressed", String((b.dataset.v || null) === on));
    }
    const lv = fLevel ? L(C.LEVELS[fLevel]) : t("recAllMaps");
    const df = fDiff ? L(C.DIFF[fDiff as keyof typeof C.DIFF]) : t("recAllDiffs");
    const season = client.season?.();
    $("recWhat").textContent = `${lv} · ${df}` + (season ? ` · ${t("recSeason", { n: season })}` : "");
    $("recWhere").hidden = !anyOpen();
  }

  /** the map and difficulty a row was reached on, as pictures (only the ones the filters leave open) */
  function whereCell(r: ScoreRow): HTMLTableCellElement {
    const td = document.createElement("td");
    td.className = "wh";
    const lv = C.LEVELS[r.level],
      df = C.DIFF[r.diff as keyof typeof C.DIFF];
    if (!lv || !df) return td; // a map or difficulty this version does not know
    const name = ui.where(r.level, r.diff);
    td.title = name;
    td.innerHTML =
      (fLevel === null ? mapThumb(lv) : "") + (fDiff === null ? skullIcon(r.diff as keyof typeof C.DIFF, 20) : "");
    const label = document.createElement("span");
    label.className = "vh";
    label.textContent = name;
    td.append(label);
    return td;
  }

  async function load() {
    const id = ++loadId;
    const status = $("recStatus"),
      body = $("recBody");
    status.hidden = false;
    status.textContent = t("recLoading");
    body.replaceChildren();
    const rows = await client.table(fLevel, fDiff, 20);
    if (id !== loadId) return; // another filter was chosen meanwhile
    markFilters(); // the table's season is known now
    if (!rows) {
      status.textContent = t("recFail");
      return;
    }
    status.hidden = rows.length > 0;
    status.textContent = t("recEmpty");
    const mine = readNick(store).toLowerCase();
    for (const r of rows) {
      const tr = document.createElement("tr");
      if (mine && r.nick.toLowerCase() === mine) tr.className = "me";
      const add = (cls: string, text: string) => {
        const td = document.createElement("td");
        td.className = cls;
        td.textContent = text; // names are text, never markup
        tr.append(td);
      };
      add("rk", String(r.rank));
      add("nm", r.nick);
      if (anyOpen()) tr.append(whereCell(r));
      add("wv", (r.won ? "★ " : "") + r.cleared);
      add("sc", r.score.toLocaleString());
      add("tm", fmtTime(r.seconds));
      body.append(tr);
    }
  }

  /** Opens the table of everything, or of one map and/or difficulty. It is read from the service every time. */
  function open(level: string | null = null, diff: string | null = null) {
    fLevel = level;
    fDiff = diff;
    renderFilters();
    screens.show("records");
    void load();
  }

  $("recFilters").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-f]");
    if (!b) return;
    const v = b.dataset.v || null;
    // the chosen one again lets go of it: back to "all"
    if (b.dataset.f === "level") fLevel = v === fLevel ? null : v;
    else fDiff = v === fDiff ? null : v;
    markFilters();
    void load();
  });
  $("recClose").addEventListener("click", () => screens.hide("records"));
  $("records").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "records") screens.hide("records");
  });
  $("saveBtn").addEventListener("click", () => void save());
  $("askYes").addEventListener("click", () => void askYes());
  $("askNo").addEventListener("click", () => {
    declined = true;
    proceed();
  });
  $("saveAsk").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "saveAsk") screens.hide("saveAsk");
  });
  for (const [id, go] of [
    ["saveNick", save],
    ["askNick", askYes],
  ] as const) {
    input(id).maxLength = NICK_MAX;
    input(id).addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") void go();
      if (e.key !== "Escape") e.stopPropagation(); // typing a name must not trigger the game's keys (n: next wave, s: sell ...), Escape still works
    });
  }
  $("mRecords").addEventListener("click", () => open());
  // from a finished game: the table of that game's map and difficulty, to see the place just won
  $("overRecords").addEventListener("click", () => open(C.S.level, C.S.diff));

  return { takeSeed, prefetch, onEnd, open, ask };
}

export type Records = ReturnType<typeof createRecords>;
