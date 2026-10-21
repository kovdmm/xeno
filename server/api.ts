// The HTTP interface of the highscore service (behind nginx, on localhost):
//   GET  /api/run?level=&diff=   a seed for a new game, with a signed single-use token
//   POST /api/run                a finished run: replayed, and entered into the table if it holds
//   GET  /api/run/<id>           the result of a run that took longer than the request waited
//   GET  /api/scores?level=&diff=&limit=   the table; without level and/or diff, the table of all maps/difficulties
//   GET  /api/health
// A score is never taken from the client: the server replays the run from its seed and the commands, and takes the
// result from its own game (src/game/run.ts).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { BALANCE } from "../src/game/balance";
import { sanitizeNick } from "../src/nick";
import type { Db } from "./db";
import { SYNC_WAIT_MS } from "./limits";
import type { Verifier } from "./verifier";

export interface ApiOptions {
  db: Db;
  verifier: Verifier;
  /** signs the seed tokens and salts the IP hashes */
  secret: string;
  /** SIM_BUILD of the game this server replays: only runs of this build are accepted */
  build: string;
  /** the clock, ms (tests replace it) */
  now?: () => number;
  /** how long a POST waits for the replay before it answers 202 and the client polls */
  syncWaitMs?: number;
  tokenTtlMs?: number;
  maxBody?: number;
  submitsPerHour?: number;
  seedsPerHour?: number;
  log?: (event: Record<string, unknown>) => void;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

const b64 = (b: Buffer) => b.toString("base64url");

/** at most `max` hits per key in the last `windowMs` */
export function createLimiter(max: number, windowMs: number, now: () => number) {
  const hits = new Map<string, number[]>();
  return {
    hit(key: string): boolean {
      const t = now();
      const list = (hits.get(key) ?? []).filter((x) => x > t - windowMs);
      if (list.length >= max) {
        hits.set(key, list);
        return false;
      }
      list.push(t);
      hits.set(key, list);
      if (hits.size > 20000) for (const [k, v] of hits) if (!v.some((x) => x > t - windowMs)) hits.delete(k);
      return true;
    },
  };
}

interface Token {
  /** the seed */
  s: number;
  l: string;
  d: string;
  /** expires, ms */
  e: number;
  /** a random id: a token is used once */
  i: string;
}

export function createApi(o: ApiOptions) {
  const now = o.now ?? Date.now;
  const syncWait = o.syncWaitMs ?? SYNC_WAIT_MS;
  const ttl = o.tokenTtlMs ?? 6 * 3600 * 1000;
  const maxBody = o.maxBody ?? 256 * 1024;
  const submits = createLimiter(o.submitsPerHour ?? 5, 3600 * 1000, now);
  const seeds = createLimiter(o.seedsPerHour ?? 120, 3600 * 1000, now);
  const log = o.log ?? (() => {});

  const sign = (payload: string) => createHmac("sha256", o.secret).update(payload).digest();
  const issue = (t: Token) => {
    const payload = b64(Buffer.from(JSON.stringify(t)));
    return payload + "." + b64(sign(payload));
  };
  function readToken(raw: unknown): Token {
    if (typeof raw !== "string" || raw.length > 600) throw new HttpError(400, "token");
    const [payload, sig, extra] = raw.split(".");
    if (!payload || !sig || extra !== undefined) throw new HttpError(400, "token");
    const want = sign(payload);
    const got = Buffer.from(sig, "base64url");
    if (got.length !== want.length || !timingSafeEqual(got, want)) throw new HttpError(400, "token");
    let t: Token;
    try {
      t = JSON.parse(Buffer.from(payload, "base64url").toString());
    } catch {
      throw new HttpError(400, "token");
    }
    if (now() > t.e) throw new HttpError(410, "expired");
    return t;
  }

  const validLevel = (v: unknown): v is string => typeof v === "string" && Object.hasOwn(BALANCE.levels, v);
  const validDiff = (v: unknown): v is string => typeof v === "string" && Object.hasOwn(BALANCE.difficulty, v);

  /** the address of the player: what nginx saw, when the request really came from nginx */
  const clientIp = (req: IncomingMessage) => {
    const remote = req.socket.remoteAddress ?? "";
    const local = remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
    const fwd = req.headers["x-real-ip"];
    return local && typeof fwd === "string" ? fwd : remote;
  };
  const ipHash = (ip: string) =>
    createHash("sha256")
      .update(o.secret + ip)
      .digest("hex")
      .slice(0, 16);

  const send = (res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      "cache-control": "no-store",
      ...headers,
    });
    res.end(JSON.stringify(body));
  };

  async function readBody(req: IncomingMessage): Promise<string> {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > maxBody) throw new HttpError(413, "too large");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > maxBody) throw new HttpError(413, "too large");
      chunks.push(c as Buffer);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  // runs that took longer than a request waits: the client asks for them by id
  interface Job {
    result?: { status: number; body: unknown };
    at: number;
  }
  const jobs = new Map<string, Job>();
  const dropOldJobs = () => {
    for (const [id, j] of jobs) if (now() - j.at > 10 * 60 * 1000) jobs.delete(id);
    while (jobs.size > 200) jobs.delete(jobs.keys().next().value as string);
  };

  async function verifyAndSave(
    run: Record<string, unknown>,
    nick: string,
    tok: Token,
    hash: string,
    runHash: string,
  ): Promise<{ status: number; body: unknown }> {
    const t0 = now();
    const r = await o.verifier.verify(run);
    if (!r.ok) {
      const detail = "detail" in r ? r.detail : undefined;
      log({ event: "submit", result: "refused", reason: r.error, detail, ip: hash, level: tok.l, diff: tok.d });
      if (r.error === "busy" || r.error === "crash") {
        o.db.releaseToken(tok.i); // not the player's fault: the same token may be tried again
        return { status: 503, body: { error: "busy" } };
      }
      if (r.error === "slow") return { status: 503, body: { error: "slow" } };
      return { status: 422, body: { error: "rejected", reason: r.error } };
    }
    const out = r.outcome;
    const saved = o.db.saveScore({
      level: tok.l,
      diff: tok.d,
      nick,
      won: out.won,
      wave: out.wave,
      cleared: out.cleared,
      score: out.score,
      seconds: out.seconds,
      build: o.build,
      created: Math.floor(now() / 1000),
      ipHash: hash,
      run,
      runHash,
    });
    log({
      event: "submit",
      result: "ok",
      nick,
      ip: hash,
      level: tok.l,
      diff: tok.d,
      wave: out.wave,
      won: out.won,
      ms: now() - t0,
    });
    return {
      status: 200,
      body: { ok: true, nick, rank: saved.rank, improved: saved.improved, outcome: out },
    };
  }

  async function submit(req: IncomingMessage, res: ServerResponse) {
    const hash = ipHash(clientIp(req));
    if (!submits.hit(hash)) throw new HttpError(429, "rate");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(await readBody(req));
    } catch (e) {
      if (e instanceof HttpError) throw e;
      throw new HttpError(400, "json");
    }
    if (typeof body !== "object" || body === null || typeof body.run !== "object" || body.run === null)
      throw new HttpError(400, "body");
    const run = body.run as Record<string, unknown>;
    const tok = readToken(body.token);
    if (run.seed !== tok.s || run.level !== tok.l || run.diff !== tok.d) throw new HttpError(400, "token mismatch");
    if (run.build !== o.build) throw new HttpError(409, "build");
    // one game is entered once, however it is sent: the hash is of the canonical text, not of the bytes received
    const runHash = createHash("sha256")
      .update(JSON.stringify([run.v, run.build, run.level, run.diff, run.seed, run.ticks, run.actions]))
      .digest("hex");
    if (o.db.hasRun(runHash)) throw new HttpError(409, "duplicate");
    if (!o.db.useToken(tok.i, tok.e)) throw new HttpError(409, "used");
    const nick = sanitizeNick(body.nick);

    const id = randomBytes(9).toString("base64url");
    const job: Job = { at: now() };
    jobs.set(id, job);
    dropOldJobs();
    const work = verifyAndSave(run, nick, tok, hash, runHash).then((r) => (job.result = r));
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), syncWait).unref());
    const done = await Promise.race([work, timeout]);
    if (done) {
      jobs.delete(id);
      return send(res, done.status, done.body);
    }
    send(res, 202, { status: "pending", id }, { "retry-after": "5" });
  }

  function poll(id: string, res: ServerResponse) {
    const job = jobs.get(id);
    if (!job) throw new HttpError(404, "no such job");
    if (!job.result) return send(res, 202, { status: "pending", id }, { "retry-after": "5" });
    send(res, job.result.status, job.result.body);
  }

  function newSeed(url: URL, req: IncomingMessage, res: ServerResponse) {
    const level = url.searchParams.get("level"),
      diff = url.searchParams.get("diff");
    if (!validLevel(level) || !validDiff(diff)) throw new HttpError(400, "level or difficulty");
    if (!seeds.hit(ipHash(clientIp(req)))) throw new HttpError(429, "rate");
    const seed = randomInt(0, 2 ** 32);
    const exp = now() + ttl;
    send(res, 200, {
      seed,
      build: o.build,
      expires: exp,
      token: issue({ s: seed, l: level, d: diff, e: exp, i: randomBytes(9).toString("base64url") }),
    });
  }

  function scores(url: URL, res: ServerResponse) {
    // a filter that is not given is "all"; one that is given must be a real map or difficulty
    const level = url.searchParams.get("level"),
      diff = url.searchParams.get("diff");
    if ((level !== null && !validLevel(level)) || (diff !== null && !validDiff(diff)))
      throw new HttpError(400, "level or difficulty");
    const raw = Number(url.searchParams.get("limit") ?? 20);
    const limit = Number.isFinite(raw) ? Math.min(50, Math.max(1, Math.floor(raw))) : 20;
    const rows = o.db.top(level, diff, limit).map((r) => ({
      rank: r.rank,
      level: r.level,
      diff: r.diff,
      nick: r.nick,
      won: r.won,
      wave: r.wave,
      cleared: r.cleared,
      score: r.score,
      seconds: Math.round(r.seconds),
      date: new Date(r.created * 1000).toISOString().slice(0, 10),
    }));
    // never cached: a player who has just been entered must see their place at once
    send(res, 200, { level, diff, rows });
  }

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const path = url.pathname.replace(/\/+$/, "");
      const method = req.method ?? "GET";
      const allow = (...m: string[]) => {
        if (!m.includes(method)) throw new HttpError(405, "method");
      };
      if (path === "/api/run") {
        allow("GET", "POST");
        return method === "GET" ? newSeed(url, req, res) : await submit(req, res);
      }
      if (path.startsWith("/api/run/")) {
        allow("GET");
        return poll(path.slice("/api/run/".length), res);
      }
      if (path === "/api/scores") {
        allow("GET");
        return scores(url, res);
      }
      if (path === "/api/health") {
        allow("GET");
        return send(res, 200, { ok: true, build: o.build, load: o.verifier.load() });
      }
      throw new HttpError(404, "not found");
    } catch (e) {
      if (e instanceof HttpError) {
        const extra: Record<string, string> =
          e.status === 429 ? { "retry-after": "600" } : e.status === 405 ? { allow: "GET, POST" } : {};
        if (e.status === 413) {
          // answer now and close; what is still coming is thrown away (not stored), and cut off after a second,
          // so the client sees the answer instead of a reset
          extra.connection = "close";
          req.resume();
          setTimeout(() => req.destroy(), 1000).unref();
        }
        if (!res.headersSent) send(res, e.status, { error: e.code }, extra);
        return;
      }
      log({ event: "error", message: e instanceof Error ? e.message : String(e) });
      if (!res.headersSent) send(res, 500, { error: "server" });
    }
  };
}
