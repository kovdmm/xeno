// The worker thread of the verifier: replays the runs it is given (server/verifier.ts).
import { parentPort } from "node:worker_threads";
import { replay } from "../src/game/run";

parentPort?.on("message", (m: { id: number; run: unknown; deadlineMs: number }) => {
  parentPort?.postMessage({ id: m.id, result: replay(m.run, { deadlineMs: m.deadlineMs }) });
});
