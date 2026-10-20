import { describe, it, expect } from "vitest";
import { queuedVerifier, workerVerifier } from "../../server/verifier";

const workerUrl = new URL("../helpers/testWorker.mjs", import.meta.url);
const outcome = (r: unknown) => (r as { outcome?: string }).outcome;

describe("the queue in front of the replays", () => {
  it("runs one at a time, in order", async () => {
    const order: string[] = [];
    let running = 0,
      most = 0;
    const v = queuedVerifier(async (run) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 10));
      order.push(String(run));
      running--;
      return { ok: false, error: "format" };
    }, 10);
    await Promise.all(["a", "b", "c"].map((x) => v.verify(x)));
    expect(order).toEqual(["a", "b", "c"]);
    expect(most).toBe(1);
  });

  it("refuses at once when the queue is full, and takes work again when it drains", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const v = queuedVerifier(async () => (await gate, { ok: false, error: "format" }), 2);
    const a = v.verify(1);
    const b = v.verify(2);
    expect(v.load()).toBe(2);
    expect(await v.verify(3)).toEqual({ ok: false, error: "busy" });
    release();
    await Promise.all([a, b]);
    expect(v.load()).toBe(0);
    expect(await v.verify(4)).toEqual({ ok: false, error: "format" });
  });

  it("a replay that throws is a crash, not the end of the queue", async () => {
    const v = queuedVerifier(async (run) => {
      if (run === "boom") throw new Error("boom");
      return { ok: false, error: "format" };
    }, 5);
    expect(await v.verify("boom")).toEqual({ ok: false, error: "crash" });
    expect(await v.verify("fine")).toEqual({ ok: false, error: "format" });
  });
});

describe("the replay thread", () => {
  it("answers, and answers the right run to the right caller", async () => {
    const v = workerVerifier({ url: workerUrl, timeoutMs: 1000, maxQueue: 5, graceMs: 200 });
    try {
      const [a, b] = await Promise.all([v.verify({ tag: "a" }), v.verify({ tag: "b" })]);
      expect(outcome(a)).toBe("a");
      expect(outcome(b)).toBe("b");
    } finally {
      v.close();
    }
  });

  it("a worker that does not answer is killed after the timeout, and the next replay gets a fresh one", async () => {
    const v = workerVerifier({ url: workerUrl, timeoutMs: 50, maxQueue: 5, graceMs: 100 });
    try {
      const t0 = Date.now();
      expect(await v.verify({ mode: "hang" })).toEqual({ ok: false, error: "slow" });
      expect(Date.now() - t0).toBeLessThan(2000);
      expect(outcome(await v.verify({ tag: "after" }))).toBe("after");
    } finally {
      v.close();
    }
  });

  it("a worker that dies is a crash, and the next replay gets a fresh one", async () => {
    const v = workerVerifier({ url: workerUrl, timeoutMs: 1000, maxQueue: 5, graceMs: 200 });
    try {
      expect(await v.verify({ mode: "crash" })).toEqual({ ok: false, error: "crash" });
      expect(outcome(await v.verify({ tag: "after" }))).toBe("after");
    } finally {
      v.close();
    }
  });

  it("the queue is bounded here too", async () => {
    const v = workerVerifier({ url: workerUrl, timeoutMs: 1000, maxQueue: 1, graceMs: 200 });
    try {
      const first = v.verify({ mode: "slow", ms: 100, tag: "first" });
      expect(await v.verify({ tag: "second" })).toEqual({ ok: false, error: "busy" });
      expect(outcome(await first)).toBe("first");
    } finally {
      v.close();
    }
  });
});
