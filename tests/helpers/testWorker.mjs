// A stand-in for server/replayWorker.ts in the verifier tests: answers by what the "run" says.
import { parentPort } from "node:worker_threads";

parentPort.on("message", ({ id, run }) => {
  if (run.mode === "hang") return; // never answers
  if (run.mode === "crash") process.exit(1);
  if (run.mode === "slow") {
    setTimeout(() => parentPort.postMessage({ id, result: { ok: true, outcome: run.tag } }), run.ms);
    return;
  }
  parentPort.postMessage({ id, result: { ok: true, outcome: run.tag } });
});
