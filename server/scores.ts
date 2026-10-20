// The highscore service: node server/scores.mjs (built by `yarn build:server`, run by systemd, behind nginx).
//   SECRET              required, at least 24 characters: signs the seed tokens
//   PORT, HOST          default 3002 on 127.0.0.1 (nginx proxies /api/ to it)
//   DB_PATH             default $STATE_DIRECTORY/highscores.db (systemd's StateDirectory) or ./highscores.db
//   REPLAY_TIMEOUT_MS   CPU time one replay may take, default 20000
//   MAX_QUEUE           replays waiting or running before new ones are refused, default 5
//   SUBMITS_PER_HOUR    runs one address may submit per hour, default 5
import { createServer } from "node:http";
import { join } from "node:path";
import { SIM_BUILD } from "../src/game/run";
import { createApi } from "./api";
import { openDb } from "./db";
import { workerVerifier } from "./verifier";

const env = process.env;
const secret = env.SECRET ?? "";
if (secret.length < 24) {
  console.error("SECRET must be set (at least 24 characters)");
  process.exit(1);
}
const port = Number(env.PORT ?? 3002);
const host = env.HOST ?? "127.0.0.1";
const submitsPerHour = Number(env.SUBMITS_PER_HOUR ?? 5);
const dbPath = env.DB_PATH ?? join(env.STATE_DIRECTORY ?? ".", "highscores.db");

const db = openDb(dbPath);
const verifier = workerVerifier({
  url: new URL("./replayWorker.mjs", import.meta.url),
  timeoutMs: Number(env.REPLAY_TIMEOUT_MS ?? 20000),
  maxQueue: Number(env.MAX_QUEUE ?? 5),
});
const log = (event: Record<string, unknown>) => console.log(JSON.stringify({ t: new Date().toISOString(), ...event }));

const server = createServer(createApi({ db, verifier, secret, build: SIM_BUILD, log, submitsPerHour }));
// slow clients must not hold connections open
server.headersTimeout = 10_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 5_000;
server.maxHeadersCount = 50;
server.listen(port, host, () =>
  log({ event: "listening", host, port, build: SIM_BUILD, db: dbPath, entries: db.count() }),
);

// tokens that expired can never be used again: forget them
const purge = setInterval(() => db.purgeTokens(Date.now()), 3600 * 1000);
purge.unref();

const stop = () => {
  log({ event: "stopping" });
  server.close(() => {
    verifier.close();
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
