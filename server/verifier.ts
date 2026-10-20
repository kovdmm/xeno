// Replays runs one at a time, away from the thread that serves requests. A replay takes from a fraction of a second
// to a few seconds of CPU (a 100-wave game: about 5 s), so it never runs in the HTTP thread, and only one runs
// at a time (the server has one core). The queue is short: when it is full the player is asked to try later.
import { Worker } from "node:worker_threads";
import type { ReplayResult } from "../src/game/run";

export type VerifyResult = ReplayResult | { ok: false; error: "busy" | "crash" };

export interface Verifier {
  verify(run: unknown): Promise<VerifyResult>;
  /** replays waiting or running */
  load(): number;
  close(): void;
}

interface Task {
  run: unknown;
  resolve(r: VerifyResult): void;
}

/**
 * A queue in front of `execute`: one at a time, at most `maxQueue` waiting or running, the rest are refused at
 * once with "busy". `execute` must always settle (the worker verifier has a timeout).
 */
export function queuedVerifier(
  execute: (run: unknown) => Promise<VerifyResult>,
  maxQueue: number,
  close: () => void = () => {},
): Verifier {
  const waiting: Task[] = [];
  let running = false;
  const next = async () => {
    if (running) return;
    const t = waiting.shift();
    if (!t) return;
    running = true;
    try {
      t.resolve(await execute(t.run));
    } catch {
      t.resolve({ ok: false, error: "crash" });
    }
    running = false;
    void next();
  };
  return {
    verify(run) {
      if (waiting.length + (running ? 1 : 0) >= maxQueue) return Promise.resolve({ ok: false, error: "busy" });
      return new Promise((resolve) => {
        waiting.push({ run, resolve });
        void next();
      });
    },
    load: () => waiting.length + (running ? 1 : 0),
    close,
  };
}

/**
 * Replays in a worker thread (the file at `url`, which answers {id, run, deadlineMs} with {id, result}). A replay
 * has `timeoutMs` of CPU time: the replay itself gives up at the deadline, and a worker that does not answer
 * within a grace period after it is killed and replaced.
 */
export function workerVerifier(opts: { url: URL; timeoutMs: number; maxQueue: number; graceMs?: number }): Verifier {
  let worker: Worker | null = null;
  let seq = 0;
  const start = () => {
    worker = new Worker(opts.url);
    worker.on("error", () => {}); // a crash settles the running replay through its exit/timeout
    return worker;
  };
  const execute = (run: unknown) =>
    new Promise<VerifyResult>((resolve) => {
      const w = worker ?? start();
      const id = ++seq;
      let done = false;
      const finish = (r: VerifyResult, kill = false) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        w.off("message", onMessage);
        w.off("exit", onExit);
        if (kill) {
          worker = null;
          void w.terminate();
        }
        resolve(r);
      };
      const onMessage = (m: { id: number; result: ReplayResult }) => m.id === id && finish(m.result);
      const onExit = () => finish({ ok: false, error: "crash" }, true);
      const timer = setTimeout(
        () => finish({ ok: false, error: "slow" }, true),
        opts.timeoutMs + (opts.graceMs ?? 2000),
      );
      w.on("message", onMessage);
      w.on("exit", onExit);
      w.postMessage({ id, run, deadlineMs: opts.timeoutMs });
    });
  return queuedVerifier(execute, opts.maxQueue, () => void worker?.terminate());
}
