// The thing that gets deployed: the bundle built by `yarn build:server`, run as a separate process with a real worker
// thread and a real database file, and checked with the same smoke test the deployment uses.
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runSmoke } from "../../scripts/smokeScores";

const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

let child: ChildProcess;
let base = "";
let dir = "";
let output = "";

beforeAll(async () => {
  // building is a script that runs when it is loaded
  await import("../../scripts/buildServer");
  dir = mkdtempSync(join(tmpdir(), "scores-"));
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ["dist-server/scores.mjs"], {
    env: {
      ...process.env,
      SECRET: "bundle-test-secret-0123456789abcdef",
      PORT: String(port),
      DB_PATH: join(dir, "h.db"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => (output += d));
  child.stderr?.on("data", (d) => (output += d));
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/api/health")).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("the service did not start:\n" + output);
}, 120_000);

afterAll(async () => {
  if (child && child.exitCode === null) {
    const exited = new Promise((r) => child.once("exit", r));
    child.kill();
    await exited; // the database file is held until the process is gone
  }
  if (dir) rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
});

describe("the built service", () => {
  it("passes the deployment smoke test with a real recorded game", async () => {
    const lines: string[] = [];
    const ok = await runSmoke(base, "bundle test", (l) => lines.push(l));
    expect(lines.join("\n")).toContain("all checks passed");
    expect(ok).toBe(true);
  }, 120_000);

  it("logs what it did as JSON lines (no player's address in them)", () => {
    const events = output
      .split("\n")
      .filter((l) => l.startsWith("{"))
      .map((l) => JSON.parse(l));
    expect(events.some((e) => e.event === "listening")).toBe(true);
    expect(events.filter((e) => e.event === "submit" && e.result === "ok")).toHaveLength(1);
    expect(output).not.toMatch(/127\.0\.0\.1:\d+"/); // the listen address is logged as host and port, not a client
    for (const e of events.filter((e) => e.event === "submit")) expect(e.ip).toMatch(/^[0-9a-f]{16}$/);
  });
});
