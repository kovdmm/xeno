// The browser's side of the highscore service (server/api.ts): a seed for a new game, the table, and the submission
// of a finished run. Every call can fail (no connection, a busy server, an old page): the game must never wait for
// the table, so every call has a time limit and the failures are values, not exceptions.
import type { Run } from "./game/run";

export interface SeedGrant {
  seed: number;
  /** signed by the server; goes back with the run */
  token: string;
  /** the simulation build the server replays */
  build: string;
  /** ms since 1970 */
  expires: number;
}

export interface ScoreRow {
  rank: number;
  level: string;
  diff: string;
  nick: string;
  won: boolean;
  /** the last wave called */
  wave: number;
  /** the waves dealt with: what ranks */
  cleared: number;
  score: number;
  seconds: number;
  date: string;
}

export type SubmitResult =
  | { status: "saved"; nick: string; rank: number; improved: boolean }
  /** the game could not be confirmed: tampered, unfinished, ... */
  | { status: "rejected"; reason: string }
  /** the page is of another version than the server */
  | { status: "outdated" }
  | { status: "busy" }
  | { status: "rate" }
  /** the token is used or too old: this game cannot be saved any more */
  | { status: "expired" }
  | { status: "offline" };

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ScoresClient {
  seed(level: string, diff: string): Promise<SeedGrant | null>;
  /** The table of one map and/or difficulty; null for "all" (the table of everything, ranked as the service ranks). */
  table(level: string | null, diff: string | null, limit?: number): Promise<ScoreRow[] | null>;
  submit(run: Run, nick: string, token: string): Promise<SubmitResult>;
}

/** how long a call may take before it counts as failed (ms) */
const QUICK = 4000;
/** a submission may be replayed for a while on the server: 202 is answered after 8 s and then polled */
const POLL_EVERY = 1500;
const POLL_FOR = 45000;

export function createScoresClient(
  opts: { fetch?: Fetch; base?: string; sleep?: (ms: number) => Promise<void> } = {},
): ScoresClient {
  const f: Fetch = opts.fetch ?? ((u, i) => fetch(u, i));
  const base = opts.base ?? "api/";
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  /** a request with a time limit; null when it failed or took too long */
  async function call(path: string, init: RequestInit = {}, limit = QUICK): Promise<Response | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), limit);
    try {
      return await f(base + path, { ...init, signal: ctl.signal });
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  const json = async (r: Response): Promise<any> => r.json().catch(() => null);

  /** what a submission's answer means */
  function answer(status: number, body: any): SubmitResult | null {
    if (status === 200 && body?.ok)
      return { status: "saved", nick: body.nick, rank: body.rank, improved: !!body.improved };
    if (status === 422) return { status: "rejected", reason: String(body?.reason ?? "") };
    if (status === 400 || status === 413) return { status: "rejected", reason: String(body?.error ?? status) };
    if (status === 409) return body?.error === "build" ? { status: "outdated" } : { status: "expired" };
    if (status === 410) return { status: "expired" };
    if (status === 429) return { status: "rate" };
    if (status === 503) return { status: "busy" };
    if (status === 202) return null; // still being replayed
    return { status: "offline" };
  }

  return {
    async seed(level, diff) {
      const r = await call(`run?level=${encodeURIComponent(level)}&diff=${encodeURIComponent(diff)}`);
      if (!r || r.status !== 200) return null;
      const b = await json(r);
      return b && Number.isInteger(b.seed) && typeof b.token === "string"
        ? { seed: b.seed, token: b.token, build: String(b.build), expires: Number(b.expires) }
        : null;
    },

    async table(level, diff, limit = 20) {
      const q = [
        level && `level=${encodeURIComponent(level)}`,
        diff && `diff=${encodeURIComponent(diff)}`,
        `limit=${limit}`,
      ];
      // always from the service: a player who has just been entered must see their place, not an earlier copy
      const r = await call(`scores?${q.filter(Boolean).join("&")}`, { cache: "no-store" });
      if (!r || r.status !== 200) return null;
      const b = await json(r);
      return Array.isArray(b?.rows) ? (b.rows as ScoreRow[]) : null;
    },

    async submit(run, nick, token) {
      // the replay can take seconds on a small server: the request may wait up to 15 s for the answer
      const r = await call(
        "run",
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ run, nick, token }) },
        15000,
      );
      if (!r) return { status: "offline" };
      const body = await json(r);
      const done = answer(r.status, body);
      if (done || !body?.id) return done ?? { status: "offline" };
      // 202: poll for the result
      for (let waited = 0; waited < POLL_FOR; waited += POLL_EVERY) {
        await sleep(POLL_EVERY);
        const p = await call("run/" + encodeURIComponent(body.id));
        if (!p) continue;
        const res = answer(p.status, await json(p));
        if (res) return res;
      }
      return { status: "busy" };
    },
  };
}
