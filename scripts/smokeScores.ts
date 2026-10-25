// A smoke test of a running highscore service, with a real recorded game:
//   node dist-server/smoke.mjs https://xeno.kovalev.app [nick]
// It asks for a seed, plays a game from it, submits it, and checks that the table shows it; then that a tampered run,
// a run with an unknown command, a used token and a run of another build are all refused. It enters ONE entry
// into the table (the nick, "smoke test" by default): remove it afterwards with `admin.mjs remove-nick "smoke test"`.
// It makes five submissions, a quarter of what one address may make in an hour by default: run it once an hour at most.
// It must be built from the same sources as the service (the runs carry a fingerprint of the simulation).
import { pathToFileURL } from "node:url";
import { recordedGame } from "../src/game/selfCheck";
import { SIM_BUILD, type Run } from "../src/game/run";

type Json = Record<string, any>;

export async function runSmoke(base: string, nick = "smoke test", say: (line: string) => void = console.log) {
  let failed = 0;
  const check = (name: string, ok: boolean, detail?: unknown) => {
    say(`${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : "  -> " + JSON.stringify(detail)}`);
    if (!ok) failed++;
  };
  type Answer = { status: number; body: Json | null };
  /**
   * nginx limits submissions to 10 a minute with a burst of 3 and answers 429 with a page, not JSON: wait and ask
   * again. The service's own limit (five an hour) answers with JSON and is an answer like any other.
   */
  const paced = async (go: () => Promise<Answer>): Promise<Answer> => {
    for (let i = 0; i < 6; i++) {
      const r = await go();
      if (r.status !== 429 || r.body !== null) return r;
      say("     (nginx's rate limit: waiting 7 s)");
      await new Promise((resolve) => setTimeout(resolve, 7000));
    }
    return go();
  };
  const get = (path: string) =>
    paced(async () => {
      const r = await fetch(base + path);
      return { status: r.status, body: (await r.json().catch(() => null)) as Json | null };
    });
  const post = (body: unknown) =>
    paced(async () => {
      const r = await fetch(base + "/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: (await r.json().catch(() => null)) as Json | null };
    });
  /** a seed and its token, and the game played from that seed */
  const fresh = async () => {
    const s = await get("/api/run?level=crossroads&diff=easy");
    if (s.status !== 200 || !s.body) throw new Error("GET /api/run answered " + s.status);
    return { token: s.body.token as string, ...recordedGame(s.body.seed as number) };
  };

  const health = await get("/api/health");
  check("health answers", health.status === 200 && health.body?.ok === true, health);
  check("the service runs the same simulation as this checkout", health.body?.build === SIM_BUILD, {
    service: health.body?.build,
    here: SIM_BUILD,
  });
  const table = await get("/api/scores?level=crossroads&diff=easy");
  check("the table can be read", table.status === 200 && Array.isArray(table.body?.rows), table);
  check("a bad level is refused", (await get("/api/scores?level=nowhere&diff=easy")).status === 400);

  const good = await fresh();
  const sent = await post({ run: good.run, nick, token: good.token });
  check("a real run is accepted", sent.status === 200 && sent.body?.ok === true, sent);
  check(
    "the server's result is the game's result",
    sent.body?.outcome?.wave === good.ended.wave && sent.body?.outcome?.score === good.ended.score,
    { server: sent.body?.outcome, game: good.ended },
  );
  const after = await get("/api/scores?level=crossroads&diff=easy&limit=50");
  check(
    "it is in the table",
    !!after.body?.rows?.some((r: Json) => r.nick === nick),
    after.body?.rows?.map((r: Json) => r.nick),
  );

  const again = await post({ run: good.run, nick, token: good.token });
  check("the same token cannot be used twice", again.status === 409, again);

  const t = await fresh();
  const tampered: Run = JSON.parse(JSON.stringify(t.run));
  tampered.actions.unshift([0, "u", 999999]);
  const r1 = await post({ run: tampered, nick, token: t.token });
  check("a tampered run is refused", r1.status === 422, r1);

  // (five submissions in all: the service lets one address submit twenty an hour by default)
  const v = await fresh();
  const old: Run = { ...JSON.parse(JSON.stringify(v.run)), build: "0123456789ab" };
  const r3 = await post({ run: old, nick, token: v.token });
  check("a run of another build is refused", r3.status === 409, r3);

  const r4 = await post({ run: v.run, nick, token: v.token + "x" });
  check("a forged token is refused", r4.status === 400, r4);

  say(failed ? `${failed} check(s) FAILED` : "all checks passed");
  return failed === 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = (process.argv[2] ?? "").replace(/\/+$/, "");
  if (!base) {
    console.error("usage: node smoke.mjs <base url> [nick]");
    process.exit(2);
  }
  process.exit((await runSmoke(base, process.argv[3])) ? 0 : 1);
}
