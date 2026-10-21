import { describe, expect, it } from "vitest";
import type { Run } from "../src/game/run";
import { createScoresClient } from "../src/scores";

const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const run = { v: 1, build: "b", level: "crossroads", diff: "easy", seed: 1, ticks: 1, actions: [] } as Run;

/** a client whose fetch answers from a script and remembers what it was asked */
function client(...answers: (Response | Error | ((init?: RequestInit) => Promise<Response>))[]) {
  const calls: { url: string; init?: RequestInit }[] = [];
  let i = 0;
  const c = createScoresClient({
    base: "api/",
    sleep: async () => {},
    fetch: async (url, init) => {
      calls.push({ url, init });
      const a = answers[Math.min(i++, answers.length - 1)];
      if (a instanceof Error) throw a;
      return typeof a === "function" ? a(init) : a;
    },
  });
  return { c, calls };
}

describe("a seed", () => {
  it("is asked for with the map and the difficulty", async () => {
    const { c, calls } = client(reply(200, { seed: 7, token: "t.s", build: "b", expires: 99 }));
    expect(await c.seed("cross roads", "easy")).toEqual({ seed: 7, token: "t.s", build: "b", expires: 99 });
    expect(calls[0].url).toBe("api/run?level=cross%20roads&diff=easy");
  });

  it("is null, never an error, when the server is away, refuses, or answers something else", async () => {
    expect(await client(new Error("offline")).c.seed("a", "b")).toBeNull();
    expect(await client(reply(429, { error: "rate" })).c.seed("a", "b")).toBeNull();
    expect(await client(reply(200, { seed: "x" })).c.seed("a", "b")).toBeNull();
    expect(await client(new Response("<html>", { status: 200 })).c.seed("a", "b")).toBeNull();
    expect(await client(reply(200, { seed: 1.5, token: "t" })).c.seed("a", "b")).toBeNull();
  });

  it("gives up when the server takes too long", async () => {
    const hang = (init?: RequestInit) =>
      new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    const { c } = client(hang);
    const t0 = Date.now();
    expect(await c.seed("a", "b")).toBeNull();
    expect(Date.now() - t0).toBeLessThan(6000);
  }, 10000);
});

describe("the table", () => {
  it("is the list of rows, asked for with a limit", async () => {
    const rows = [{ rank: 1, nick: "Ann", won: false, wave: 9, cleared: 7, score: 1, seconds: 2, date: "2026-10-21" }];
    const { c, calls } = client(reply(200, { rows }));
    expect(await c.table("crossroads", "easy", 5)).toEqual(rows);
    expect(calls[0].url).toBe("api/scores?level=crossroads&diff=easy&limit=5");
  });

  it("is the table of everything without a map or a difficulty, and filters by either", async () => {
    const { c, calls } = client(reply(200, { rows: [] }));
    await c.table(null, null, 20);
    await c.table("crossroads", null, 20);
    await c.table(null, "hard", 20);
    expect(calls.map((x) => x.url)).toEqual([
      "api/scores?limit=20",
      "api/scores?level=crossroads&limit=20",
      "api/scores?diff=hard&limit=20",
    ]);
  });

  it("is always read from the service, never from the browser's cache: a place just won must show", async () => {
    const { c, calls } = client(reply(200, { rows: [] }));
    await c.table("crossroads", "easy");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("is null when it cannot be had", async () => {
    expect(await client(new Error("x")).c.table("a", "b")).toBeNull();
    expect(await client(reply(500, {})).c.table("a", "b")).toBeNull();
    expect(await client(reply(200, { rows: "no" })).c.table("a", "b")).toBeNull();
  });
});

describe("a submission", () => {
  it("sends the run, the name and the token, and reports the place", async () => {
    const { c, calls } = client(reply(200, { ok: true, nick: "Ann", rank: 3, improved: true }));
    expect(await c.submit(run, "Ann", "tok")).toEqual({ status: "saved", nick: "Ann", rank: 3, improved: true });
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ run, nick: "Ann", token: "tok" });
  });

  it("says what the refusal was", async () => {
    const one = async (status: number, body: unknown) =>
      (await client(reply(status, body)).c.submit(run, "n", "t")).status;
    expect(await one(422, { reason: "action" })).toBe("rejected");
    expect(await one(400, { error: "token" })).toBe("rejected");
    expect(await one(413, { error: "too large" })).toBe("rejected");
    expect(await one(409, { error: "build" })).toBe("outdated");
    expect(await one(409, { error: "used" })).toBe("expired");
    expect(await one(409, { error: "duplicate" })).toBe("expired");
    expect(await one(410, { error: "expired" })).toBe("expired");
    expect(await one(429, { error: "rate" })).toBe("rate");
    expect(await one(503, { error: "busy" })).toBe("busy");
    expect(await one(500, {})).toBe("offline");
    expect((await client(new Error("down")).c.submit(run, "n", "t")).status).toBe("offline");
  });

  it("waits for a replay that takes a while: 202, then asks for the answer by id", async () => {
    const { c, calls } = client(
      reply(202, { status: "pending", id: "job1" }),
      reply(202, { status: "pending", id: "job1" }),
      reply(200, { ok: true, nick: "Ann", rank: 1, improved: false }),
    );
    expect(await c.submit(run, "Ann", "tok")).toEqual({ status: "saved", nick: "Ann", rank: 1, improved: false });
    expect(calls.map((x) => x.url)).toEqual(["api/run", "api/run/job1", "api/run/job1"]);
  });

  it("does not wait for ever", async () => {
    const { c } = client(reply(202, { id: "j" }), () => Promise.resolve(reply(202, { id: "j" })));
    expect(await c.submit(run, "n", "t")).toEqual({ status: "busy" });
  });
});
