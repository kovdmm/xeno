import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { replay, SIM_BUILD, type Run } from "../../src/game/run";
import { recordedGame } from "../../src/game/selfCheck";
import { createApi, createLimiter, type ApiOptions } from "../../server/api";
import { openDb } from "../../server/db";
import { queuedVerifier, type Verifier } from "../../server/verifier";

const SECRET = "test-secret-0123456789-abcdefghij";
const servers: Server[] = [];
afterEach(() => void servers.splice(0).forEach((s) => s.close()));

/** a service on a free port, an in-memory table, replays in this thread, a clock the test moves */
async function start(o: Partial<ApiOptions> & { verifier?: Verifier } = {}) {
  const db = openDb(":memory:");
  const clock = { t: 1_800_000_000_000 };
  const verifier = o.verifier ?? queuedVerifier(async (run) => replay(run), 5);
  const server = createServer(createApi({ db, verifier, secret: SECRET, build: SIM_BUILD, now: () => clock.t, ...o }));
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const get = async (path: string, headers: Record<string, string> = {}) => {
    const r = await fetch(base + path, { headers });
    return { status: r.status, headers: r.headers, body: (await r.json().catch(() => null)) as any };
  };
  const post = async (body: unknown, headers: Record<string, string> = {}, raw?: string) => {
    const r = await fetch(base + "/api/run", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: raw ?? JSON.stringify(body),
    });
    return { status: r.status, headers: r.headers, body: (await r.json().catch(() => null)) as any };
  };
  /** a seed with its token, and the game played from that seed */
  const fresh = async (headers: Record<string, string> = {}) => {
    const s = await get("/api/run?level=crossroads&diff=easy", headers);
    return { token: s.body.token as string, seed: s.body.seed as number, ...recordedGame(s.body.seed) };
  };
  /** a token the way the service makes them, for a seed the test chooses */
  const mint = (seed: number, id: string, exp = clock.t + 3600_000) => {
    const payload = Buffer.from(JSON.stringify({ s: seed, l: "crossroads", d: "easy", e: exp, i: id })).toString(
      "base64url",
    );
    return payload + "." + createHmac("sha256", SECRET).update(payload).digest().toString("base64url");
  };
  return { db, clock, get, post, fresh, mint, base };
}

describe("a seed for a new game", () => {
  it("is random, signed, and tells the build the run must be recorded on", async () => {
    const s = await start();
    const a = await s.get("/api/run?level=crossroads&diff=easy");
    const b = await s.get("/api/run?level=crossroads&diff=easy");
    expect(a.status).toBe(200);
    expect(Number.isInteger(a.body.seed) && a.body.seed >= 0 && a.body.seed < 2 ** 32).toBe(true);
    expect(a.body.build).toBe(SIM_BUILD);
    expect(a.body.token).toMatch(/^[\w-]+\.[\w-]+$/);
    expect(a.body.seed).not.toBe(b.body.seed);
    expect(a.headers.get("cache-control")).toBe("no-store");
    expect(a.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("is refused for a map or a difficulty that does not exist", async () => {
    const s = await start();
    for (const q of [
      "",
      "?level=crossroads",
      "?level=nowhere&diff=easy",
      "?level=crossroads&diff=godlike",
      "?level=__proto__&diff=easy",
    ])
      expect((await s.get("/api/run" + q)).status, q).toBe(400);
  });

  it("is limited per address", async () => {
    const s = await start({ seedsPerHour: 3 });
    for (let i = 0; i < 3; i++) expect((await s.get("/api/run?level=crossroads&diff=easy")).status).toBe(200);
    const r = await s.get("/api/run?level=crossroads&diff=easy");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
  });
});

describe("a finished run", () => {
  it("is replayed and entered: the table shows what the game came to, not what the client says", async () => {
    const s = await start();
    const g = await s.fresh();
    const r = await s.post({
      run: g.run,
      nick: "Ann",
      token: g.token,
      score: 999999,
      wave: 999,
      cleared: 999,
      won: true,
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, nick: "Ann", rank: 1, improved: true });
    expect(r.body.outcome).toEqual(g.ended);
    const t = await s.get("/api/scores?level=crossroads&diff=easy");
    expect(t.status).toBe(200);
    expect(t.body.rows).toHaveLength(1);
    expect(t.body.rows[0]).toMatchObject({
      rank: 1,
      nick: "Ann",
      won: g.ended.won,
      wave: g.ended.wave,
      cleared: g.ended.cleared,
      score: g.ended.score,
    });
    expect(t.body.rows[0].score).not.toBe(999999);
    expect(t.body.rows[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("keeps a name's best: a second, different game of the same name enters only if it is better", async () => {
    const s = await start();
    const a = await s.fresh();
    const b = await s.fresh();
    expect((await s.post({ run: a.run, nick: "Ann", token: a.token })).status).toBe(200);
    const rb = await s.post({ run: b.run, nick: "ann", token: b.token });
    expect(rb.status).toBe(200);
    const rows = (await s.get("/api/scores?level=crossroads&diff=easy")).body.rows;
    expect(rows).toHaveLength(1);
    const best = [a, b].sort((x, y) => y.ended.score - x.ended.score)[0];
    if (a.ended.cleared === b.ended.cleared) expect(rows[0].score).toBe(best.ended.score);
  });

  it("cannot be entered twice: the token is used up", async () => {
    const s = await start();
    const g = await s.fresh();
    expect((await s.post({ run: g.run, nick: "A", token: g.token })).status).toBe(200);
    expect((await s.post({ run: g.run, nick: "B", token: g.token })).status).toBe(409);
  });

  it("cannot be entered twice with a second token for the same game (the canonical text is remembered)", async () => {
    const s = await start();
    const g = await s.fresh();
    expect((await s.post({ run: g.run, nick: "A", token: g.token })).status).toBe(200);
    const again = await s.post({ run: g.run, nick: "B", token: s.mint(g.seed, "another-token") });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe("duplicate");
    // written another way (key order, spaces) it is still the same game
    const reordered = JSON.parse(
      JSON.stringify({
        actions: g.run.actions,
        ticks: g.run.ticks,
        seed: g.run.seed,
        diff: g.run.diff,
        level: g.run.level,
        build: g.run.build,
        v: 1,
      }),
    );
    const r2 = await s.post({ run: reordered, nick: "C", token: s.mint(g.seed, "third-token") });
    expect(r2.body.error).toBe("duplicate");
  });

  it("a tampered run is refused, and its token is gone", async () => {
    const s = await start();
    const g = await s.fresh();
    const bad: Run = JSON.parse(JSON.stringify(g.run));
    bad.actions.unshift([0, "u", 999999]);
    const r = await s.post({ run: bad, nick: "Cheat", token: g.token });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ error: "rejected", reason: "action" });
    expect((await s.post({ run: g.run, nick: "Cheat", token: g.token })).status).toBe(409);
    expect((await s.get("/api/scores?level=crossroads&diff=easy")).body.rows).toHaveLength(0);
  });

  it("a run cut short, or one that goes on after the end, is refused", async () => {
    const s = await start();
    const cut = await s.fresh();
    cut.run.ticks = Math.floor(cut.run.ticks / 2);
    cut.run.actions = cut.run.actions.filter((a) => a[0] <= cut.run.ticks);
    expect(await s.post({ run: cut.run, nick: "x", token: cut.token })).toMatchObject({
      status: 422,
      body: { reason: "unfinished" },
    });
    const long = await s.fresh();
    long.run.ticks += 5;
    expect(await s.post({ run: long.run, nick: "x", token: long.token })).toMatchObject({
      status: 422,
      body: { reason: "format" },
    });
  });

  it("with a command the format does not have, or a field it does not have, is refused", async () => {
    const s = await start();
    const a = await s.fresh();
    (a.run.actions as unknown[]).push([a.run.ticks, "x"]);
    expect((await s.post({ run: a.run, nick: "x", token: a.token })).status).toBe(422);
    const b = await s.fresh();
    expect((await s.post({ run: { ...b.run, note: "hi" }, nick: "x", token: b.token })).status).toBe(422);
  });

  it("is bound to the token: another seed, map or difficulty than the one issued is refused", async () => {
    const s = await start();
    const g = await s.fresh();
    for (const change of [{ seed: (g.run.seed + 1) >>> 0 }, { level: "switchback" }, { diff: "hard" }]) {
      const r = await s.post({ run: { ...g.run, ...change }, nick: "x", token: g.token });
      expect(r.status, JSON.stringify(change)).toBe(400);
    }
    expect((await s.post({ run: g.run, nick: "x", token: g.token })).status).toBe(200); // none of that burned the token
  });

  it("must be of the build the service runs; a refusal for that keeps the token", async () => {
    const s = await start();
    const g = await s.fresh();
    const r = await s.post({ run: { ...g.run, build: "an-older-game" }, nick: "x", token: g.token });
    expect(r).toMatchObject({ status: 409, body: { error: "build" } });
    expect((await s.post({ run: g.run, nick: "x", token: g.token })).status).toBe(200);
  });

  it("needs a token that is ours, whole, and not too old", async () => {
    const s = await start({ submitsPerHour: 100 });
    const g = await s.fresh();
    const post = (token: unknown) => s.post({ run: g.run, nick: "x", token });
    expect((await post(undefined)).status).toBe(400);
    expect((await post("")).status).toBe(400);
    expect((await post("nonsense")).status).toBe(400);
    expect((await post(g.token + "x")).status).toBe(400);
    expect((await post(g.token.replace(/^./, "A"))).status).toBe(400);
    expect((await post(g.token + ".more")).status).toBe(400);
    expect((await post(5)).status).toBe(400);
    s.clock.t += 7 * 3600_000; // the token lasts six hours
    expect((await post(g.token)).status).toBe(410);
  });

  it("is refused when it is not even JSON, or not a run", async () => {
    const s = await start();
    expect((await s.post(null, {}, "{not json")).status).toBe(400);
    expect((await s.post({ nick: "x" })).status).toBe(400);
    expect((await s.post({ run: "text", token: "x" })).status).toBe(400);
    expect((await s.post([1, 2])).status).toBe(400);
  });

  it("is refused when it is far too big, before it is read to the end", async () => {
    const s = await start();
    const r = await s.post(null, {}, JSON.stringify({ run: { actions: "x".repeat(300_000) } }));
    expect(r.status).toBe(413);
  });
});

describe("the name", () => {
  it("is cleaned; Anonymous when nothing is left", async () => {
    const s = await start();
    const a = await s.fresh();
    const ra = await s.post({ run: a.run, nick: "  <b>Evil</b>  ‮ ", token: a.token });
    expect(ra.body.nick).toBe("bEvilb");
    const b = await s.fresh();
    expect((await s.post({ run: b.run, nick: 12345, token: b.token })).body.nick).toBe("Anonymous");
  });
});

describe("limits", () => {
  it("one address submits only so many runs an hour, whatever they are", async () => {
    const s = await start({ submitsPerHour: 2 });
    for (let i = 0; i < 2; i++) expect((await s.post({ nope: 1 })).status).toBe(400);
    const r = await s.post({ nope: 1 });
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBeTruthy();
    s.clock.t += 3601_000;
    expect((await s.post({ nope: 1 })).status).toBe(400); // an hour later it is a bad request again, not a limit
  });

  it("an address is the one nginx forwards, so players behind it do not share a limit", async () => {
    const s = await start({ submitsPerHour: 1 });
    expect((await s.post({ nope: 1 }, { "x-real-ip": "203.0.113.1" })).status).toBe(400);
    expect((await s.post({ nope: 1 }, { "x-real-ip": "203.0.113.1" })).status).toBe(429);
    expect((await s.post({ nope: 1 }, { "x-real-ip": "203.0.113.2" })).status).toBe(400);
  });

  it("the limiter forgets old hits", () => {
    let t = 0;
    const l = createLimiter(2, 1000, () => t);
    expect([l.hit("a"), l.hit("a"), l.hit("a")]).toEqual([true, true, false]);
    expect(l.hit("b")).toBe(true);
    t = 1001;
    expect(l.hit("a")).toBe(true);
  });
});

describe("a busy server", () => {
  it("asks the player to come back, and gives the token back", async () => {
    const busy = queuedVerifier(async () => ({ ok: false, error: "format" }), 0); // always full
    const s = await start({ verifier: busy });
    const g = await s.fresh();
    const r = await s.post({ run: g.run, nick: "x", token: g.token });
    expect(r).toMatchObject({ status: 503, body: { error: "busy" } });
    // the same token again: it was not used up (busy again, but not 409)
    expect((await s.post({ run: g.run, nick: "x", token: g.token })).status).toBe(503);
  });

  it("a replay that takes longer than the request waits is answered later, by id", async () => {
    const real = queuedVerifier(async (run) => {
      await new Promise((r) => setTimeout(r, 150));
      return replay(run);
    }, 5);
    const s = await start({ verifier: real, syncWaitMs: 20 });
    const g = await s.fresh();
    const first = await s.post({ run: g.run, nick: "Late", token: g.token });
    expect(first.status).toBe(202);
    expect(first.body.status).toBe("pending");
    let done = await s.get("/api/run/" + first.body.id);
    for (let i = 0; i < 50 && done.status === 202; i++) {
      await new Promise((r) => setTimeout(r, 20));
      done = await s.get("/api/run/" + first.body.id);
    }
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ ok: true, nick: "Late", rank: 1 });
    expect((await s.get("/api/run/unknown-id")).status).toBe(404);
  });

  it("a replay that is too slow burns the token, a crash does not", async () => {
    const slow = queuedVerifier(async () => ({ ok: false, error: "slow" }), 5);
    const s = await start({ verifier: slow });
    const g = await s.fresh();
    expect((await s.post({ run: g.run, nick: "x", token: g.token })).status).toBe(503);
    expect((await s.post({ run: g.run, nick: "x", token: g.token })).status).toBe(409);
    const crashing = queuedVerifier(async () => ({ ok: false, error: "crash" }), 5);
    const s2 = await start({ verifier: crashing });
    const h = await s2.fresh();
    expect((await s2.post({ run: h.run, nick: "x", token: h.token })).status).toBe(503);
    expect((await s2.post({ run: h.run, nick: "x", token: h.token })).status).toBe(503); // not 409: still usable
  });
});

describe("the table and the rest of the interface", () => {
  it("is read per map and difficulty, with a limit that is kept in range", async () => {
    const s = await start();
    for (let i = 0; i < 3; i++) {
      const g = await s.fresh();
      expect((await s.post({ run: g.run, nick: "p" + i, token: g.token })).status).toBe(200);
    }
    const all = await s.get("/api/scores?level=crossroads&diff=easy");
    expect(all.body.rows).toHaveLength(3);
    expect(all.body.rows.map((r: { rank: number }) => r.rank)).toEqual([1, 2, 3]);
    expect((await s.get("/api/scores?level=crossroads&diff=easy&limit=1")).body.rows).toHaveLength(1);
    expect((await s.get("/api/scores?level=crossroads&diff=easy&limit=0")).body.rows).toHaveLength(1);
    expect((await s.get("/api/scores?level=crossroads&diff=easy&limit=abc")).body.rows).toHaveLength(3);
    expect((await s.get("/api/scores?level=crossroads&diff=easy&limit=99999")).body.rows).toHaveLength(3);
    expect((await s.get("/api/scores?level=crossroads&diff=hard")).body.rows).toHaveLength(0);
    expect((await s.get("/api/scores?level=nowhere&diff=easy")).status).toBe(400);
    expect((await s.get("/api/scores?level=crossroads&diff=godlike")).status).toBe(400);
    expect((await s.get("/api/scores?diff=__proto__")).status).toBe(400);
  });

  it("is never cached, so that a player who was just entered sees their place at once", async () => {
    const s = await start();
    expect((await s.get("/api/scores?level=crossroads&diff=easy")).headers.get("cache-control")).toBe("no-store");
    expect((await s.get("/api/scores")).headers.get("cache-control")).toBe("no-store");
  });

  it("is the table of everything without a map or a difficulty, ranked as the service ranks, and filters by either", async () => {
    const s = await start();
    const put = (level: string, diff: string, nick: string, cleared: number, won = false) =>
      s.db.saveScore({
        level,
        diff,
        nick,
        won,
        wave: cleared,
        cleared,
        score: cleared * 10,
        seconds: 100,
        build: "x",
        created: 1_800_000_000,
        ipHash: "h",
        run: {},
        runHash: [level, diff, nick].join("/"),
      });
    put("crossroads", "easy", "Ann", 10);
    put("crossroads", "hard", "Ann", 30);
    put("switchback", "easy", "Bob", 20);
    put("switchback", "hard", "Cy", 5, true);
    const all = (await s.get("/api/scores")).body.rows as { rank: number; nick: string; level: string; diff: string }[];
    expect(all.map((r) => [r.rank, r.nick, r.level, r.diff])).toEqual([
      [1, "Cy", "switchback", "hard"], // a win beats everything
      [2, "Ann", "crossroads", "hard"],
      [3, "Bob", "switchback", "easy"],
      [4, "Ann", "crossroads", "easy"],
    ]);
    const byMap = (await s.get("/api/scores?level=crossroads")).body.rows;
    expect(byMap.map((r: { nick: string; diff: string }) => r.nick + r.diff)).toEqual(["Annhard", "Anneasy"]);
    const byDiff = (await s.get("/api/scores?diff=easy")).body.rows;
    expect(byDiff.map((r: { nick: string; level: string }) => r.nick + r.level)).toEqual([
      "Bobswitchback",
      "Anncrossroads",
    ]);
    expect((await s.get("/api/scores?limit=2")).body.rows).toHaveLength(2);
  });

  it("answers health, and 404 or 405 for the rest", async () => {
    const s = await start();
    expect((await s.get("/api/health")).body).toMatchObject({ ok: true, build: SIM_BUILD, load: 0 });
    expect((await s.get("/api/nothing")).status).toBe(404);
    expect((await s.get("/")).status).toBe(404);
    for (const method of ["PUT", "DELETE", "PATCH"]) {
      const r = await fetch(s.base + "/api/run", { method });
      expect(r.status, method).toBe(405);
    }
    expect((await fetch(s.base + "/api/scores", { method: "POST" })).status).toBe(405);
  });
});
