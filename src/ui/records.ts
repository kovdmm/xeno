// The highscore table in the interface: a server seed for the next game (so a finished game can be entered), the
// "save to the table" box on the end screen, and the records screen. The game never waits for any of it: without a
// connection a game starts from a local seed and is simply not enterable.
import { sanitizeNick, NICK_MAX } from "../nick";
import type { ScoresClient, SeedGrant, SubmitResult } from "../scores";
import type { UiContext } from "./context";

const NICK_KEY = "xt-nick";
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
    try {
      const g = await client.seed(level, diff);
      if (g) {
        spare = { ...g, level, diff };
        // the game in hand started without a seed (the server was not reached in time): it may take this one
        if (!playing) deps.onSeed();
      }
    } finally {
      asking = false;
    }
  }

  /** The seed for a new game on this map and difficulty, if the server has given one; asks for the next one. */
  function takeSeed(level: string, diff: string): number | undefined {
    const g = spare;
    spare = null;
    playing = null;
    void prefetch(level, diff);
    if (g && g.level === level && g.diff === diff && g.expires - now() > 60_000) {
      playing = { token: g.token, seed: g.seed, level, diff };
      return g.seed;
    }
    return undefined;
  }

  // ---- the end screen --------------------------------------------------------------------------------------------

  const box = () => $("saveBox");
  const msg = (text: string) => ($("saveMsg").textContent = text);
  let saved = false;

  /** Shows the save box when the game that just ended can be entered. */
  function onEnd() {
    const run = C.run();
    const ok =
      !!run && !!playing && run.seed === playing.seed && run.level === playing.level && run.diff === playing.diff;
    saved = false;
    box().hidden = !ok;
    if (!ok) return;
    ($("saveNick") as HTMLInputElement).value = store.get(NICK_KEY) ?? "";
    ($("saveBtn") as HTMLButtonElement).disabled = false;
    ($("saveBtn") as HTMLButtonElement).hidden = false;
    msg("");
  }

  const WHY: Record<Exclude<SubmitResult["status"], "saved">, string> = {
    rejected: "saveRejected",
    outdated: "saveOutdated",
    busy: "saveBusy",
    rate: "saveRate",
    expired: "saveExpired",
    offline: "saveOffline",
  };

  async function save() {
    const run = C.run();
    if (!run || !playing || saved) return;
    const btn = $("saveBtn") as HTMLButtonElement;
    const nick = sanitizeNick(($("saveNick") as HTMLInputElement).value);
    btn.disabled = true;
    msg(t("saveSending"));
    const r = await client.submit(run, nick, playing.token);
    if (r.status === "saved") {
      saved = true;
      store.set(NICK_KEY, nick === "Anonymous" ? "" : nick);
      btn.hidden = true;
      msg(t(r.improved ? "saveOk" : "saveOkWorse", { n: r.rank, d: ui.where(run.level, run.diff) }));
      return;
    }
    msg(t(WHY[r.status]));
    // a used or too old token, or a game the server does not accept, cannot be tried again; the rest can
    btn.disabled = r.status === "rejected" || r.status === "outdated" || r.status === "expired";
  }

  // ---- the records screen ----------------------------------------------------------------------------------------

  let loadId = 0;

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  function fillSelects(level: string, diff: string) {
    const opts = (ids: string[], name: (id: string) => string, on: string) =>
      ids.map((id) => `<option value="${id}"${id === on ? " selected" : ""}>${name(id)}</option>`).join("");
    $("recLevel").innerHTML = opts(C.LKEYS, (id) => L(C.LEVELS[id]), level);
    $("recDiff").innerHTML = opts(C.DKEYS, (k) => L(C.DIFF[k as keyof typeof C.DIFF]), diff);
  }

  async function load() {
    const level = ($("recLevel") as HTMLSelectElement).value,
      diff = ($("recDiff") as HTMLSelectElement).value;
    const id = ++loadId;
    const status = $("recStatus"),
      body = $("recBody");
    status.hidden = false;
    status.textContent = t("recLoading");
    body.replaceChildren();
    const rows = await client.table(level, diff, 20);
    if (id !== loadId) return; // another map or difficulty was chosen meanwhile
    if (!rows) {
      status.textContent = t("recFail");
      return;
    }
    status.hidden = rows.length > 0;
    status.textContent = t("recEmpty");
    const mine = (store.get(NICK_KEY) ?? "").toLowerCase();
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
      add("wv", (r.won ? "★ " : "") + r.cleared);
      add("sc", r.score.toLocaleString());
      add("tm", fmtTime(r.seconds));
      body.append(tr);
    }
  }

  function open(level = st.level, diff = st.diff) {
    fillSelects(level, diff);
    screens.show("records");
    void load();
  }

  $("recLevel").addEventListener("change", () => void load());
  $("recDiff").addEventListener("change", () => void load());
  $("recClose").addEventListener("click", () => screens.hide("records"));
  $("records").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).id === "records") screens.hide("records");
  });
  $("saveBtn").addEventListener("click", () => void save());
  $("saveNick").addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") void save();
    e.stopPropagation(); // typing a name must not trigger the game's keys (n: next wave, s: sell ...)
  });
  ($("saveNick") as HTMLInputElement).maxLength = NICK_MAX;
  $("mRecords").addEventListener("click", () => open());
  $("overRecords").addEventListener("click", () => open(C.S.level, C.S.diff));

  return { takeSeed, prefetch, onEnd, open };
}

export type Records = ReturnType<typeof createRecords>;
